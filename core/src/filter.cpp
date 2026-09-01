// Prizma Filter Parser implementasyonu — uBO/ABP sözdizimi

#include "filter.h"

#include <algorithm>
#include <cctype>

namespace prizma {

bool is_ascii_alnum(char c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
}

bool is_separator(char c) {
  // uBO: ^ = [^0-9A-Za-z_.-] ya da URL sonu
  if (c == '\0') return true;
  return !is_ascii_alnum(c) && c != '_' && c != '.' && c != '-';
}

std::string to_lower_ascii(const std::string& s) {
  std::string r = s;
  for (char& c : r) {
    if (c >= 'A' && c <= 'Z') c = static_cast<char>(c + 32);
  }
  return r;
}

bool ends_with(const std::string& s, const std::string& suf) {
  return s.size() >= suf.size() && s.compare(s.size() - suf.size(), suf.size(), suf) == 0;
}

bool starts_with(const std::string& s, const std::string& pre) {
  return s.size() >= pre.size() && s.compare(0, pre.size(), pre) == 0;
}

namespace {

// Filtrenin hedeflediği istek tipini döndürür; tanınmayan ise 0 ve ok=false.
bool parse_type_option(const std::string& opt, uint32_t& bits) {
  static const struct {
    const char* name;
    uint32_t bit;
  } kTypes[] = {
      {"document", T_DOCUMENT},     {"doc", T_DOCUMENT},
      {"subdocument", T_SUBDOC},    {"sub_frame", T_SUBDOC}, {"frame", T_SUBDOC},
      {"stylesheet", T_STYLESHEET}, {"style", T_STYLESHEET},
      {"script", T_SCRIPT},
      {"image", T_IMAGE},           {"img", T_IMAGE},
      {"object", T_OBJECT},         {"object-subrequest", T_OBJECT},
      {"media", T_MEDIA},
      // B14: uBlock Origin spec — $xhr == xmlhttprequest + fetch (ikisi birden).
      //      d3ward vb. testler fetch(HEAD) yapar; tek bit'e map edilirse kaçar.
      {"xmlhttprequest", T_XHR},
      {"xhr", static_cast<uint32_t>(T_XHR | T_FETCH)},
      {"fetch", T_FETCH},
      {"font", T_FONT},
      {"websocket", T_WEBSOCKET},
      {"ping", T_PING},             {"beacon", T_PING},
      {"other", T_OTHER},
  };
  for (const auto& t : kTypes) {
    if (opt == t.name) {
      bits = t.bit;
      return true;
    }
  }
  return false;
}

// Bir pattern'den index token'ı çıkar: noktalama ayrılmış en uzun parça (>=4).
std::string extract_token(const std::string& pattern) {
  std::string best;
  std::string cur;
  for (char c : pattern) {
    if (is_ascii_alnum(c)) {
      cur.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
    } else {
      if (cur.size() >= 4 && cur.size() > best.size()) best = cur;
      cur.clear();
    }
  }
  if (cur.size() >= 4 && cur.size() > best.size()) best = cur;
  // Index subrun'ları (url_subruns) en fazla 12 karakter üretir; token'ı da
  // 12 ile sınırla yoksa uzun token'lar (ör. googlesyndication) hiç aday olamaz.
  if (best.size() > 12) best.resize(12);
  return best;
}

}  // namespace

ParseResult parse_line(const std::string& line_in, uint32_t next_id) {
  ParseResult out;
  std::string line = line_in;
  // satır sonu temizliği
  while (!line.empty() && (line.back() == '\r' || line.back() == '\n')) line.pop_back();
  if (line.empty()) return out;
  // yorum / bölüm başlığı
  if (line[0] == '!') return out;
  if (line[0] == '[' && line.back() == ']') return out;
  if (starts_with(line, "# ")) return out;

  // ── Cosmetic filtreler: ilk '#' ayracı ────────────────────────────────────
  const size_t hash = line.find('#');
  if (hash != std::string::npos) {
    // ağ filtresinde '#' olamaz; güvenli: '#' öncesi kısım domain listesi olmalı
    std::string prefix = to_lower_ascii(line.substr(0, hash));
    std::string rest = line.substr(hash);
    bool domains_ok = prefix.empty();
    if (!prefix.empty()) {
      domains_ok = true;
      // domain listesi: virgül ayrılmış; her biri geçerli hostname karakterleri
      for (char c : prefix) {
        if (!is_ascii_alnum(c) && c != '.' && c != '~' && c != ',' && c != '-' && c != '%') {
          domains_ok = false;
          break;
        }
      }
    }
    if (!domains_ok) return out;  // ağ filtresine benzeyen satırı yok say

    CosmeticFilter cf;
    cf.raw = line;

    size_t i = hash;
    if (i + 3 <= line.size() && line.compare(i, 3, "#@#") == 0) {
      cf.is_exception = true;
      i += 3;
      // B4: '#@#sel:style(...)' → C_STYLE exception. Aksi halde C_HIDE
      // exception'ı üretilir; engine'de style iptali çalışmaz ve
      // '##sel:style(...)' kuralı uygulanmaya devam eder.
      if (line.find(":style(", i) != std::string::npos) {
        cf.kind = C_STYLE;
      }
    } else if (i + 3 <= line.size() && line.compare(i, 3, "#?#") == 0) {
      cf.kind = C_PROCEDURAL;
      i += 3;
    } else if (i + 3 <= line.size() && line.compare(i, 3, "#$#") == 0) {
      cf.kind = C_STYLE;
      i += 3;
    } else if (i + 3 <= line.size() && line.compare(i, 3, "#%#") == 0) {
      cf.kind = C_SCRIPTLET;
      i += 3;
    } else if (i + 3 <= line.size() && line.compare(i, 3, "##^") == 0) {
      cf.kind = C_REMOVE;
      i += 3;
    } else if (i + 2 <= line.size() && line.compare(i, 2, "##") == 0) {
      if (i + 5 <= line.size() && line.compare(i + 2, 3, "+js") == 0) {
        cf.kind = C_SCRIPTLET;
        i += 2;  // '##' tüket, '+js(...)' C_SCRIPTLET bloğunda işlenir
      } else {
        cf.kind = C_HIDE;
        i += 2;
        // '##sel:style(...)' → C_STYLE (AdGuard/easy:style komutu).
        // Yanlışlıkla C_HIDE olarak parse edilirse selector ':is()' füzyonuna
        // girer ve tüm :is() grubunu geçersiz CSS'e çevirir.
        if (line.find(":style(", i) != std::string::npos) {
          cf.kind = C_STYLE;
        }
      }
    } else {
      return out;  // tanınmayan '#x#' formu
    }

    std::string sel = line.substr(i);
    if (sel.empty()) return out;

    // domain kısmını ayır
    if (!prefix.empty()) {
      cf.is_generic = false;
      size_t pos = 0;
      while (pos < prefix.size()) {
        size_t comma = prefix.find(',', pos);
        std::string d = prefix.substr(pos, comma == std::string::npos ? std::string::npos : comma - pos);
        DomainRule rule;
        if (!d.empty() && d[0] == '~') {
          rule.negative = true;
          d = d.substr(1);
        }
        rule.name = d;
        if (!d.empty() && d != "~") cf.domains.push_back(std::move(rule));
        if (comma == std::string::npos) break;
        pos = comma + 1;
      }
    }

    if (cf.kind == C_SCRIPTLET) {
      // Modern form:  ##+js(name, arg1, ...)
      // Eski form:    #%#//scriptlet('name', 'arg1', ...)
      cf.selector = sel;
      std::string body = sel;
      size_t m = body.find("+js(");
      if (m == std::string::npos) {
        const std::string mark = "scriptlet(";
        m = body.find(mark);
        if (m == std::string::npos) return out;  // tanınmayan scriptlet satırı — atla
        m += mark.size();
      } else {
        m += 4;  // "+js(" uzunluğu
      }
      body = body.substr(m);
      if (!body.empty() && body.back() == ')') body.pop_back();
      // argümanları ayır: tırnak, regex (/) ve parantez/braces içi virgüller korunur
      size_t p = 0;
      while (p < body.size()) {
        while (p < body.size() && (body[p] == ' ' || body[p] == '\t')) ++p;
        if (p >= body.size()) break;
        std::string arg;
        int depth = 0;          // () {} [] iç içe
        char q = 0;             // ' " veya '/' (regex)
        bool started = false;
        while (p < body.size()) {
          char c = body[p];
          if (q != 0) {
            arg.push_back(c);
            if (c == '\\' && q != '/' && p + 1 < body.size()) {
              arg.push_back(body[p + 1]);
              p += 2;
              continue;
            }
            if (c == q) {
              if (q == '/' && started && depth == 0) {
                // regex sonu — sonrası 'g','i','m','s' vb. flag olabilir
                q = 0;
              } else if (q != '/') {
                q = 0;
              }
            }
            ++p;
            continue;
          }
          if (c == '\'' || c == '"') {
            q = c;
            arg.push_back(c);
            ++p;
            continue;
          }
          if (c == '/' && depth == 0 && !started) {
            q = c;
            started = true;
            arg.push_back(c);
            ++p;
            continue;
          }
          if (c == '(' || c == '{' || c == '[') {
            ++depth;
            started = true;
            arg.push_back(c);
            ++p;
            continue;
          }
          if (c == ')' || c == '}' || c == ']') {
            if (depth > 0) --depth;
            started = true;
            arg.push_back(c);
            ++p;
            continue;
          }
          if (c == ',' && depth == 0) {
            ++p;  // argüman ayracı
            break;
          }
          arg.push_back(c);
          started = true;
          ++p;
        }
        // baştaki/sondaki boşlukları ve tırnakları temizle
        size_t a = 0, b = arg.size();
        while (a < b && (arg[a] == ' ' || arg[a] == '\t')) ++a;
        while (b > a && (arg[b - 1] == ' ' || arg[b - 1] == '\t')) --b;
        arg = arg.substr(a, b - a);
        if (!arg.empty() &&
            (arg.front() == '\'' || arg.front() == '"') &&
            arg.back() == arg.front() && arg.size() >= 2) {
          arg = arg.substr(1, arg.size() - 2);
        }
        if (!arg.empty()) cf.scriptlet_args.push_back(arg);
      }
      if (cf.scriptlet_args.empty()) return out;
    } else if (cf.kind == C_PROCEDURAL) {
      // prosedürel operatörü tespit et (basit, ilk ':op(')
      cf.selector = sel;
      static const char* kOps[] = {":has-text(", ":has(", ":xpath(", ":upward(", ":matches-attr(", ":matches-property(", ":min-text-length(", ":not("};
      for (const char* op : kOps) {
        if (sel.find(op) != std::string::npos) {
          std::string opn(op + 1);
          opn.pop_back();  // '(' kaldır
          cf.op = opn;
          break;
        }
      }
    } else {
      cf.selector = sel;
    }

    // exception kosmetik: #@# için is_generic + domain negatif mantık engine'de
    out.cos.push_back(std::move(cf));
    return out;
  }

  // ── Ağ filtresi ───────────────────────────────────────────────────────────
  NetworkFilter nf;
  nf.raw = line;
  nf.id = next_id;

  size_t p = 0;
  const size_t n = line.size();

  // exception
  if (n >= 2 && line[0] == '@' && line[1] == '@') {
    nf.is_exception = true;
    p = 2;
  }
  // hostname anchor
  if (n >= p + 2 && line.compare(p, 2, "||") == 0) {
    nf.hostname_anchor = true;
    p += 2;
  } else if (n > p && line[p] == '|') {
    nf.anchor_start = true;
    p += 1;
  }

  // başlangıç '|' hostname-anchor'dan sonra da olabilir (||x| gibi değil; atla)

  // $ seçeneklerini ayır
  std::string pattern_part = line.substr(p);
  std::string options_part;
  const size_t dollar = pattern_part.rfind('$');
  if (dollar != std::string::npos) {
    // '$' pattern içinde de olabilir (regex gibi) — güvenli: '$' öncesi kısmın
    // geçerli bir pattern olup olmadığına bak; options varsa parçala
    options_part = pattern_part.substr(dollar + 1);
    pattern_part = pattern_part.substr(0, dollar);
  }

  // opsiyonları çözümle
  bool ok = true;
  uint32_t type_bits = 0;
  uint8_t party = P_ANY;
  bool has_party = false;
  bool match_case = false;
  bool badfilter = false;
  bool important = false;
  bool is_regex = false;
  bool special_only = false;  // yalnızca özel/no-op seçenekler (ağ engelleme yok)
  bool has_remove_param = false;
  std::string remove_param;   // boş = tüm parametreler; ad ya da /regex/
  std::string regex_src;
  std::vector<DomainRule> domains;

  if (!options_part.empty()) {
    size_t pos = 0;
    while (pos < options_part.size()) {
      size_t comma = options_part.find(',', pos);
      std::string opt = options_part.substr(pos, comma == std::string::npos ? std::string::npos : comma - pos);
      if (!opt.empty() && opt[0] == ',') opt = opt.substr(1);
      if (!opt.empty()) {
        uint32_t tb = 0;
        if (parse_type_option(opt, tb)) {
          type_bits |= tb;
        } else if (opt == "third-party" || opt == "3p") {
          party = P_THIRD;
          has_party = true;
        } else if (opt == "~third-party" || opt == "~3p") {
          // negasyon: ~third-party == first-party (uBO/AdGuard syntax'ı)
          party = P_FIRST;
          has_party = true;
        } else if (opt == "first-party" || opt == "1p") {
          party = P_FIRST;
          has_party = true;
        } else if (opt == "~first-party" || opt == "~1p") {
          // negasyon: ~first-party == third-party
          party = P_THIRD;
          has_party = true;
        } else if (opt == "important") {
          important = true;
        } else if (opt == "badfilter") {
          badfilter = true;
        } else if (opt == "match-case") {
          match_case = true;
        } else if (starts_with(opt, "domain=")) {
          std::string dlist = opt.substr(7);
          size_t dp = 0;
          while (dp < dlist.size()) {
            size_t bar = dlist.find('|', dp);
            std::string d = dlist.substr(dp, bar == std::string::npos ? std::string::npos : bar - dp);
            DomainRule rule;
            if (!d.empty() && d[0] == '~') {
              rule.negative = true;
              d = d.substr(1);
            }
            d = to_lower_ascii(d);
            if (!d.empty()) {
              rule.name = d;
              domains.push_back(std::move(rule));
            }
            if (bar == std::string::npos) break;
            dp = bar + 1;
          }
        } else if (starts_with(opt, "regexp=")) {
          is_regex = true;
          regex_src = opt.substr(7);
        } else if (opt == "csp" || starts_with(opt, "csp=")) {
          // CSP filtresi: ilk sürümde yok say (engelleme değil, başlık enjeksiyonu)
        } else if (starts_with(opt, "redirect") || opt == "empty" || opt == "mp4") {
          // yönlendirme: ilk sürümde yok say
        } else if (starts_with(opt, "removeparam") || starts_with(opt, "queryprune")) {
          // Teknoloji 2: $removeparam / $queryprune — URL query parametresi
          // temizleme. Değer boşsa TÜM parametreler silinir; değer düz ad ya da
          // /regex/ olabilir (ad eşleşmeleri ayrıca büyük/küçük harf duyarsız).
          has_remove_param = true;
          const char* pre = starts_with(opt, "removeparam") ? "removeparam" : "queryprune";
          const size_t pl = std::string(pre).size();
          if (opt.size() > pl && opt[pl] == '=') {
            remove_param = opt.substr(pl + 1);
          }
        } else if (starts_with(opt, "replace=")) {
          // parametre değeri değiştirme: ilk sürümde yok say
        } else if (opt == "denyallow") {
          // yok say
        } else if (opt == "noop" || opt == "all" || opt == "popunder" || opt == "popup") {
          // yok say
        } else if (opt == "cosmetic") {
          // $cosmetic seçeneği: bu domain için TÜM cosmetic filtreleri devre dışı
          nf.is_cosmetic_exception = true;
          if (opt == "popup") type_bits |= T_OTHER;  // popup engelleme: diğer olarak
        } else if (opt == "genericblock" || opt == "generichide" || opt == "inline-script" || opt == "inline-font" || opt == "strict1p" || opt == "strict3p") {
          // ağ engelleme yok — yalnızca özel direktif
          special_only = true;
        } else if (opt == "specifichide") {
          special_only = true;
        } else {
          ok = false;  // tanınmayan seçenek → filtreyi düşür (uBO davranışı)
        }
      }
      if (comma == std::string::npos) break;
      pos = comma + 1;
    }
  }

  if (!ok) return out;
  if (pattern_part.empty()) return out;
  // Yalnızca özel direktiflerden oluşan (generichide vb.) filtre gerçek bir ağ
  // kuralı değildir; tip ya da parti kısıtı yoksa DÜŞÜR. (tip/parti varsa asıl
  // engelleme anlamı korunur, özel direktif zaten ilk sürümde yok sayılır.)
  if (special_only && type_bits == 0 && !has_party) return out;

  // regex formatı: /pattern/ (kaynak ilk ve son / arasında)
  if (pattern_part.size() >= 2 && pattern_part.front() == '/' && pattern_part.back() == '/') {
    is_regex = true;
    regex_src = pattern_part.substr(1, pattern_part.size() - 2);
    if (regex_src.empty()) return out;
  }

  nf.type_bits = type_bits;
  nf.party = party;
  nf.has_party = has_party;
  nf.match_case = match_case;
  nf.is_badfilter = badfilter;
  nf.is_important = important;
  nf.has_remove_param = has_remove_param;
  nf.remove_param = remove_param;
  nf.domains = std::move(domains);

  if (is_regex) {
    nf.is_regex = true;
    nf.regex_src = regex_src;
    nf.pattern.clear();
    out.nets.push_back(std::move(nf));
    return out;
  }

  // '^' ve '*' pattern içinde kalır; anchor bitiş
  std::string pat = pattern_part;
  if (pat.size() >= 1 && pat.back() == '|') {
    // '|' sonunda: ama '||' çakışması yok çünkü başlangıçta ele alındı
    nf.anchor_end = true;
    pat.pop_back();
  }
  if (pat.empty()) return out;

  if (!nf.match_case) pat = to_lower_ascii(pat);
  nf.pattern = pat;
  nf.token = extract_token(pat);

  out.nets.push_back(std::move(nf));
  return out;
}

}  // namespace prizma