#include "engine.h"

#include <algorithm>
#include <cstdio>
#include <regex>
#include <set>

#include "pattern.h"

namespace prizma {

namespace {

// URL'den alfanumerik koşuları çıkarır; her koşunun tüm alt koşuları (4..12)
// dahil — substring token kaçırmamak için.
void url_subruns(const std::string& s, std::vector<std::string>& out) {
  const size_t n = s.size();
  size_t i = 0;
  while (i < n) {
    if (!is_ascii_alnum(s[i])) {
      ++i;
      continue;
    }
    size_t j = i;
    while (j < n && is_ascii_alnum(s[j])) ++j;
    for (size_t start = i; start < j; ++start) {
      const size_t maxlen = std::min<size_t>(12, j - start);
      for (size_t l = 4; l <= maxlen; ++l) {
        out.emplace_back(s, start, l);
      }
    }
    i = j;
  }
}

// Regex kaynağından literal token'ları çıkarır.
void regex_tokens(const std::string& src, std::vector<std::string>& out) {
  bool in_class = false;
  size_t run_start = std::string::npos;
  auto flush = [&](size_t end) {
    if (run_start != std::string::npos && end - run_start >= 4) {
      std::string t = src.substr(run_start, end - run_start);
      if (t.size() > 12) t.resize(12);
      out.emplace_back(std::move(t));
    }
    run_start = std::string::npos;
  };
  for (size_t i = 0; i < src.size(); ++i) {
    char c = src[i];
    if (c == '\\') {
      flush(i);
      ++i;
      continue;
    }
    if (c == '[') {
      flush(i);
      in_class = true;
      continue;
    }
    if (c == ']') {
      in_class = false;
      continue;
    }
    if (in_class) {
      flush(i);
      continue;
    }
    if (is_ascii_alnum(c)) {
      if (run_start == std::string::npos) run_start = i;
    } else {
      flush(i);
    }
  }
  flush(src.size());
}

// Document hostname'in verilen domainle eşleşip eşleşmediği (tam veya sonek).
bool host_matches_domain(const std::string& host, const std::string& domain) {
  if (domain.empty()) return false;
  if (host == domain) return true;
  if (host.size() > domain.size() &&
      host.compare(host.size() - domain.size(), domain.size(), domain) == 0) {
    return host[host.size() - domain.size() - 1] == '.';
  }
  return false;
}

}  // namespace

// ── Yükleme ─────────────────────────────────────────────────────────────────

void Engine::load_list(const std::string& text) {
  uint32_t id = 0;
  std::vector<NetworkFilter> parsed_nets;
  std::vector<CosmeticFilter> parsed_cos;

  size_t pos = 0;
  const size_t n = text.size();
  while (pos < n) {
    size_t eol = text.find('\n', pos);
    if (eol == std::string::npos) eol = n;
    std::string line = text.substr(pos, eol - pos);
    ParseResult r = parse_line(line, id);
    for (auto& f : r.nets) {
      f.id = id++;
      parsed_nets.push_back(std::move(f));
    }
    for (auto& c : r.cos) parsed_cos.push_back(std::move(c));
    pos = eol + 1;
  }

  for (auto& f : parsed_nets) {
    if (f.is_badfilter) {
      badfilters_.push_back(std::move(f));
      continue;
    }
    if (f.is_regex) {
      RegexFilter rf;
      rf.id = f.id;
      rf.raw = f.raw;
      rf.src = f.regex_src;
      rf.is_exception = f.is_exception;
      rf.is_important = f.is_important;
      rf.match_case = f.match_case;
      rf.type_bits = f.type_bits;
      rf.party = f.party;
      rf.has_party = f.has_party;
      rf.domains = std::move(f.domains);
      std::vector<std::string> toks;
      regex_tokens(rf.src, toks);
      std::string best;
      for (auto& t : toks) {
        if (t.size() > best.size()) best = t;
      }
      // url_subruns küçük harf ürettiği için token da küçük harf olmalı,
      // yoksa büyük harf içeren regex kaynakları token ön-filtresinde
      // asla aday olamaz (sessiz false-negative).
      rf.token = best.size() >= 4 ? to_lower_ascii(best) : std::string();
      // RegExp'i yükleme zamanında BİR KEZ derle — her istekte std::regex
      // kurmak O(100) regex için ciddi CPU israfı. uBO/JS regex'lerinin
      // desteklediği lookahead/lookbehind/named-group gibi yapılar
      // std::regex'te derlenemez → re_ok=false → JS-Native RegExp motoruna
      // devredilir (regex_export_json ile dışa aktarılır).
      try {
        rf.re = std::regex(rf.src, rf.match_case ? std::regex::ECMAScript
                                                 : std::regex::ECMAScript |
                                                       std::regex::icase);
        rf.re_ok = true;
      } catch (const std::regex_error&) {
        rf.re_ok = false;
      }
      regexes_.push_back(std::move(rf));
      continue;
    }
    if (f.token.empty()) {
      brute_.push_back(std::move(f));
    } else {
      f.id = static_cast<uint32_t>(nets_.size());
      index_.add(f.token, f.id);
      nets_.push_back(std::move(f));
    }
  }

  for (auto& c : parsed_cos) cos_.push_back(std::move(c));
  guard_.build(nets_, brute_);
}

void Engine::clear() {
  nets_.clear();
  brute_.clear();
  regexes_.clear();
  badfilters_.clear();
  cos_.clear();
  index_.clear();
  guard_.clear();
  matches_ = 0;
  blocked_ = 0;
}

// ── Seçenek kontrolü ────────────────────────────────────────────────────────

bool Engine::check_domains(const std::vector<DomainRule>& rules,
                           const std::string& host) const {
  if (rules.empty()) return true;
  bool any_positive = false;
  for (const auto& r : rules) {
    if (r.negative) {
      if (host_matches_domain(host, r.name)) return false;
    } else {
      any_positive = true;
      if (host_matches_domain(host, r.name)) return true;
    }
  }
  return !any_positive;
}

bool Engine::check_options(const NetworkFilter& f, uint32_t type_bit,
                           const std::string& doc_hostname,
                           bool third_party) const {
  if (f.type_bits != 0 && (f.type_bits & type_bit) == 0) return false;
  if (f.has_party) {
    if (f.party == P_THIRD && !third_party) return false;
    if (f.party == P_FIRST && third_party) return false;
  }
  if (!f.domains.empty() && !check_domains(f.domains, doc_hostname)) return false;
  return true;
}

bool Engine::is_badfilter_match(const NetworkFilter& a, const NetworkFilter& b) const {
  if (a.pattern != b.pattern) return false;
  if (a.hostname_anchor != b.hostname_anchor) return false;
  if (a.anchor_start != b.anchor_start) return false;
  if (a.anchor_end != b.anchor_end) return false;
  if (a.is_exception != b.is_exception) return false;
  if (a.match_case != b.match_case) return false;
  if (a.type_bits != b.type_bits) return false;
  if (a.has_party != b.has_party || (a.has_party && a.party != b.party)) return false;
  if (a.domains.size() != b.domains.size()) return false;
  for (size_t i = 0; i < a.domains.size(); ++i) {
    if (a.domains[i].negative != b.domains[i].negative) return false;
    if (a.domains[i].name != b.domains[i].name) return false;
  }
  return true;
}

bool Engine::filter_cancelled(const NetworkFilter& f) const {
  if (badfilters_.empty()) return false;
  for (const auto& b : badfilters_) {
    if (is_badfilter_match(f, b)) return true;
  }
  return false;
}

// ── Ağ eşleştirme ──────────────────────────────────────────────────────────

Engine::MatchResult Engine::match(const std::string& url_in, uint32_t type_bit,
                                  const std::string& hostname,
                                  const std::string& doc_hostname,
                                  bool third_party) const {
  ++matches_;
  MatchResult res;
  last_priority_ = -1;
  if (nets_.empty() && brute_.empty() && regexes_.empty()) return res;

  const std::string url = to_lower_ascii(url_in);
  const std::string hn = to_lower_ascii(hostname);

  // 1) Token adayları (sadece index'li filtreler; brute ayrı döngüyle)
  std::vector<std::string> runs;
  url_subruns(url, runs);
  std::set<uint32_t> candidates;
  for (const auto& run : runs) {
    const std::vector<uint32_t>* ids = index_.find(run);
    if (ids) {
      for (uint32_t id : *ids) candidates.insert(id);
    }
  }

  // 2) Aday değerlendirme
  const NetworkFilter* block_rule = nullptr;
  const NetworkFilter* allow_rule = nullptr;
  const NetworkFilter* block_imp = nullptr;
  const NetworkFilter* allow_imp = nullptr;
  // $removeparam: engelleme değil, query parametresi temizleme.
  // Engelleme/exception kararından BAĞIMSIZ tutulur; eşleşen ilk kural
  // son aşamada raporlanır (gerçek blok varsa blok kazanır).
  const NetworkFilter* prune_rule = nullptr;

  auto evaluate = [&](const NetworkFilter& nf) {
    if (filter_cancelled(nf)) return;
    if (!check_options(nf, type_bit, doc_hostname, third_party)) return;
    const bool m = match_network_pattern(
        nf.match_case ? url_in : url, hn, nf.pattern, nf.anchor_start,
        nf.anchor_end, nf.hostname_anchor).matched;
    if (!m) return;
    if (nf.has_remove_param) {
      if (!prune_rule) prune_rule = &nf;
      return;
    }
    if (nf.is_exception) {
      if (nf.is_important) {
        if (!allow_imp) allow_imp = &nf;
      } else {
        if (!allow_rule) allow_rule = &nf;
      }
    } else {
      if (nf.is_important) {
        if (!block_imp) block_imp = &nf;
      } else {
        if (!block_rule) block_rule = &nf;
      }
    }
  };

  for (uint32_t id : candidates) {
    if (id >= nets_.size()) continue;
    evaluate(nets_[id]);
  }
  for (const auto& f : brute_) evaluate(f);

  // 3) Regex filtreler (token ön-filtresi ile) — erken return YOK, toplanır
  bool block_rule_re = false, allow_rule_re = false;
  bool block_imp_re = false, allow_imp_re = false;
  std::string block_re_raw, allow_re_raw, block_imp_re_raw, allow_imp_re_raw;
  if (!regexes_.empty()) {
    for (const auto& rf : regexes_) {
      if (!rf.token.empty()) {
        bool token_found = false;
        for (const auto& run : runs) {
          if (run == rf.token) {
            token_found = true;
            break;
          }
        }
        if (!token_found) continue;
      }
      if (rf.type_bits != 0 && (rf.type_bits & type_bit) == 0) continue;
      if (rf.has_party) {
        if (rf.party == P_THIRD && !third_party) continue;
        if (rf.party == P_FIRST && third_party) continue;
      }
      if (!rf.domains.empty() && !check_domains(rf.domains, doc_hostname)) continue;
      bool cancelled = false;
      for (const auto& b : badfilters_) {
        if (b.is_regex && b.regex_src == rf.src) {
          cancelled = true;
          break;
        }
      }
      if (cancelled) continue;
      // C++'ta derlenemeyen (lookahead vb.) regex'ler JS-Native RegExp
      // motoruna devredilir — burada sessizce atlanmaz.
      if (!rf.re_ok) continue;
      bool re_match = false;
      try {
        re_match = std::regex_search(url, rf.re);
      } catch (const std::regex_error&) {
        // B13: catastrophic backtracking / complexity aşımı → bu istek için
        //      kuralı sessizce atla (blok yanlış pozitifinden iyidir).
        continue;
      }
      if (!re_match) continue;
      if (rf.is_exception) {
        if (rf.is_important) {
          if (!allow_imp_re) { allow_imp_re = true; allow_imp_re_raw = rf.raw; }
        } else if (!allow_rule_re) { allow_rule_re = true; allow_re_raw = rf.raw; }
      } else {
        if (rf.is_important) {
          if (!block_imp_re) { block_imp_re = true; block_imp_re_raw = rf.raw; }
        } else if (!block_rule_re) { block_rule_re = true; block_re_raw = rf.raw; }
      }
    }
  }

  // 4) Karar: allow_imp > block_imp > allow > block
  if (allow_imp || allow_imp_re) {
    res.action = 0;
    res.rule_raw = allow_imp ? allow_imp->raw : allow_imp_re_raw;
    res.from_regex = allow_imp == nullptr;
    res.priority = 3;
    last_priority_ = 3;
    return res;
  }
  if (block_imp || block_imp_re) {
    res.action = 1;
    res.rule_raw = block_imp ? block_imp->raw : block_imp_re_raw;
    res.from_regex = block_imp == nullptr;
    res.priority = 2;
    last_priority_ = 2;
    ++blocked_;
    return res;
  }
  if (allow_rule || allow_rule_re) {
    res.action = 0;
    res.rule_raw = allow_rule ? allow_rule->raw : allow_re_raw;
    res.from_regex = allow_rule == nullptr;
    res.priority = 1;
    last_priority_ = 1;
    return res;
  }
  if (block_rule || block_rule_re) {
    res.action = 1;
    res.rule_raw = block_rule ? block_rule->raw : block_re_raw;
    res.from_regex = block_rule == nullptr;
    res.priority = 0;
    last_priority_ = 0;
    ++blocked_;
    return res;
  }

  // 5) $removeparam: blok/exception yoksa query temizleme kuralını raporla.
  //    Eşleşen kural arka planda isteği iptal ETMEZ; sadece parametreleri
  //    ayıklar (redirectUrl ile). Engelleme önceliği her zaman kazanır.
  if (prune_rule) {
    res.action = 1;
    res.rule_raw = prune_rule->raw;
    res.priority = 0;
    last_priority_ = 0;
    return res;
  }
  return res;
}

// ── Cosmetic ────────────────────────────────────────────────────────────────

void Engine::collect_cosmetic(std::vector<const CosmeticFilter*>& out,
                              const std::string& hostname, bool generic) const {
  for (const auto& c : cos_) {
    if (c.is_generic != generic) continue;
    if (generic) {
      out.push_back(&c);
      continue;
    }
    bool pos = false;
    bool neg = false;
    for (const auto& r : c.domains) {
      const bool m = host_matches_domain(hostname, r.name);
      if (r.negative) {
        if (m) {
          neg = true;
          break;
        }
      } else if (m) {
        pos = true;
      }
    }
    if (pos && !neg) out.push_back(&c);
  }
}

void Engine::append_json_escape(std::string& out, const std::string& s) const {
  for (char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char buf[8];
          snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out.push_back(c);
        }
    }
  }
}

std::string Engine::cosmetic_json(const std::string& hostname_in) const {
  const std::string hostname = to_lower_ascii(hostname_in);

  std::vector<const CosmeticFilter*> specific;
  std::vector<const CosmeticFilter*> generic;
  collect_cosmetic(specific, hostname, false);
  collect_cosmetic(generic, hostname, true);

  // exception'lar: specific exception, aynı selector'a sahip generic filtreyi
  // ve specific filtreyi kapsar (host eşleşirse).
  std::set<std::string> hide_except, remove_except;
  for (const auto* c : specific) {
    if (!c->is_exception) continue;
    hide_except.insert(c->selector);
  }
  for (const auto* c : generic) {
    if (!c->is_exception) continue;
    hide_except.insert(c->selector);
  }

  std::string out;
  out.reserve(1024);
  out += "{\"hide\":[";

  // ── Native Cosmetic Fusion: basit selector'lar tek :is() gruplarına birleştirilir.
  // 13.750 ayrı {display:none} kuralı yerine ~2-3 :is() kuralı → DOM/CSSOM'da
  // muazzam kazanç ve minimal algılanabilir CSS. (uBO bunu yapmaz — her kuralı
  // ayrı üretir.)
  std::vector<std::string> fuse_sel;
  bool first = true;
  auto emit_raw = [&](const std::string& s) {
    if (!first) out += ",";
    first = false;
    out += "\"";
    append_json_escape(out, s);
    out += "\"";
  };
  // :is() birleştirme — her çağrıda mevcut grubu EMIT eder ve boşaltır.
  // B1: 128 eşiği döngü içinde push sonrası kontrol edilir; ayrıca
  // fusable olmayan selector'a geçişte bekleyen grup asla kaybolmaz
  // (önceki hata: <128 elemanlı grup build edilip çöpe atılıyordu).
  auto flush_fuse = [&]() {
    if (fuse_sel.empty()) return;
    std::string group;
    group += ":is(";
    for (size_t i = 0; i < fuse_sel.size(); ++i) {
      if (i) group += ",";
      group += fuse_sel[i];
    }
    group += ")";
    emit_raw(group);
    fuse_sel.clear();
  };

  auto can_fuse = [](const std::string& s) {
    // virgül, pseudo-element ve prosedürel operatörler füzyondan çıkarılır
    if (s.find(',') != std::string::npos) return false;
    if (s.find(":style(") != std::string::npos) return false;
    if (s.find('{') != std::string::npos) return false;
    if (s.find(":has(") != std::string::npos) return false;
    if (s.find(":xpath(") != std::string::npos) return false;
    if (s.find(":contains(") != std::string::npos) return false;
    if (s.find(":matches-") != std::string::npos) return false;
    if (s.find("::") != std::string::npos) return false;
    if (s.find(":before") != std::string::npos) return false;
    if (s.find(":after") != std::string::npos) return false;
    return true;
  };

  // tek tek emit etmek yerine topla: exception selector'ları hide_except'te
  // (yukarıda) toplandı — tekrar hesaplamaya gerek yok.

  // specific + generic hide selector'larını topla (fusion + bireysel karışık)
  for (const auto* c : specific) {
    if (c->is_exception || c->kind != C_HIDE) continue;
    if (hide_except.count(c->selector)) continue;
    if (can_fuse(c->selector)) {
      fuse_sel.push_back(c->selector);
      if (fuse_sel.size() >= 128) flush_fuse();
    } else { flush_fuse(); emit_raw(c->selector); }
  }
  for (const auto* c : generic) {
    if (c->is_exception || c->kind != C_HIDE) continue;
    if (hide_except.count(c->selector)) continue;
    if (can_fuse(c->selector)) {
      fuse_sel.push_back(c->selector);
      if (fuse_sel.size() >= 128) flush_fuse();
    } else { flush_fuse(); emit_raw(c->selector); }
  }
  flush_fuse();

  out += "],\"remove\":[";
  first = true;
  for (const auto* c : specific) {
    if (c->is_exception || c->kind != C_REMOVE) continue;
    if (remove_except.count(c->selector)) continue;
    if (!first) out += ",";
    first = false;
    out += "\"";
    append_json_escape(out, c->selector);
    out += "\"";
  }
  for (const auto* c : generic) {
    if (c->is_exception || c->kind != C_REMOVE) continue;
    if (remove_except.count(c->selector)) continue;
    if (!first) out += ",";
    first = false;
    out += "\"";
    append_json_escape(out, c->selector);
    out += "\"";
  }

  out += "],\"style\":[";
  first = true;
  auto emit_style = [&](const CosmeticFilter& c) {
    // format 1: sel { css }   format 2: sel:style(css)
    std::string sel = c.selector;
    std::string css;
    size_t st = sel.find(":style(");
    if (st != std::string::npos) {
      css = sel.substr(st + 7);
      if (!css.empty() && css.back() == ')') css.pop_back();
      sel = sel.substr(0, st);
    } else {
      size_t br = sel.find('{');
      if (br != std::string::npos) {
        size_t br2 = sel.rfind('}');
        css = sel.substr(br + 1, br2 == std::string::npos ? std::string::npos : br2 - br - 1);
        sel = sel.substr(0, br);
      }
    }
    auto trim = [](std::string& s) {
      size_t a = 0, b = s.size();
      while (a < b && (s[a] == ' ' || s[a] == '\t')) ++a;
      while (b > a && (s[b - 1] == ' ' || s[b - 1] == '\t' || s[b - 1] == '\r')) --b;
      s = s.substr(a, b - a);
    };
    trim(sel);
    trim(css);
    if (sel.empty()) return;
    if (!first) out += ",";
    first = false;
    out += "[\"";
    append_json_escape(out, sel);
    out += "\",\"";
    append_json_escape(out, css);
    out += "\"]";
  };
  for (const auto* c : specific) {
    if (c->is_exception || c->kind != C_STYLE) continue;
    // B4: #@#...:style( exception'ı aynı selector'ı iptal etmeli
    if (hide_except.count(c->selector)) continue;
    emit_style(*c);
  }
  for (const auto* c : generic) {
    if (c->is_exception || c->kind != C_STYLE) continue;
    if (hide_except.count(c->selector)) continue;
    emit_style(*c);
  }

  out += "],\"scriptlets\":[";
  first = true;
  for (const auto* c : specific) {
    if (c->is_exception || c->kind != C_SCRIPTLET) continue;
    if (!first) out += ",";
    first = false;
    out += "{\"name\":\"";
    append_json_escape(out, c->scriptlet_args.empty() ? c->selector : c->scriptlet_args[0]);
    out += "\",\"args\":[";
    for (size_t i = 1; i < c->scriptlet_args.size(); ++i) {
      if (i > 1) out += ",";
      out += "\"";
      append_json_escape(out, c->scriptlet_args[i]);
      out += "\"";
    }
    out += "]}";
  }
  for (const auto* c : generic) {
    if (c->is_exception || c->kind != C_SCRIPTLET) continue;
    if (!first) out += ",";
    first = false;
    out += "{\"name\":\"";
    append_json_escape(out, c->scriptlet_args.empty() ? c->selector : c->scriptlet_args[0]);
    out += "\",\"args\":[";
    for (size_t i = 1; i < c->scriptlet_args.size(); ++i) {
      if (i > 1) out += ",";
      out += "\"";
      append_json_escape(out, c->scriptlet_args[i]);
      out += "\"";
    }
    out += "]}";
  }

  out += "],\"procedural\":[";
  first = true;
  for (const auto* c : specific) {
    if (c->is_exception || c->kind != C_PROCEDURAL) continue;
    if (!first) out += ",";
    first = false;
    out += "{\"sel\":\"";
    append_json_escape(out, c->selector);
    out += "\",\"op\":\"";
    append_json_escape(out, c->op);
    out += "\"}";
  }
  for (const auto* c : generic) {
    if (c->is_exception || c->kind != C_PROCEDURAL) continue;
    if (!first) out += ",";
    first = false;
    out += "{\"sel\":\"";
    append_json_escape(out, c->selector);
    out += "\",\"op\":\"";
    append_json_escape(out, c->op);
    out += "\"}";
  }

  out += "]}";
  return out;
}

std::string Engine::regex_export_json() const {
  std::string out;
  out += "[";
  bool first = true;
  for (const auto& rf : regexes_) {
    // C++ std::regex'in derleyebildiği (re_ok) filtreler WASM tarafında
    // zaten eşleştirilir; JS'e yalnızca derlenemeyenler devredilir —
    // çifte değerlendirme ve çifte sayaç olmaz.
    if (rf.re_ok) continue;
    if (!first) out += ",";
    first = false;
    out += "{\"s\":\"";
    append_json_escape(out, rf.src);
    out += "\",\"raw\":\"";
    append_json_escape(out, rf.raw);
    out += "\",\"e\":";
    out += rf.is_exception ? "1" : "0";
    out += ",\"i\":";
    out += rf.is_important ? "1" : "0";
    out += ",\"m\":";
    out += rf.match_case ? "1" : "0";
    out += ",\"t\":";
    out += std::to_string(rf.type_bits);
    out += ",\"p\":";
    out += std::to_string(rf.party);
    out += ",\"hp\":";
    out += rf.has_party ? "1" : "0";
    out += ",\"d\":[";
    for (size_t i = 0; i < rf.domains.size(); ++i) {
      if (i) out += ",";
      out += "[\"";
      append_json_escape(out, rf.domains[i].name);
      out += "\",";
      out += rf.domains[i].negative ? "1" : "0";
      out += "]";
    }
    out += "],\"tok\":\"";
    append_json_escape(out, rf.token);
    out += "\",\"ok\":0}";
  }
  out += "]";
  return out;
}

std::string Engine::stats_json() const {
  std::string out;
  out += "{\"net_filters\":";
  out += std::to_string(net_filter_count());
  out += ",\"regex_filters\":";
  out += std::to_string(regex_filter_count());
  out += ",\"cosmetic_filters\":";
  out += std::to_string(cosmetic_filter_count());
  out += ",\"brute_filters\":";
  out += std::to_string(brute_.size());
  out += ",\"badfilters\":";
  out += std::to_string(badfilters_.size());
  out += ",\"index_entries\":";
  out += std::to_string(index_.size());
  out += ",\"matches\":";
  out += std::to_string(matches_);
  out += ",\"blocked\":";
  out += std::to_string(blocked_);
  out += "}";
  return out;
}

}  // namespace prizma