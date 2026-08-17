// Prizma motor testleri — assert tabanlı, harici bağımlılık yok.
// Native:  g++ -std=c++17 -O2 -o test_engine test_engine.cpp ../src/*.cpp
// WASM'de: build-wasm.sh içinde ayrıca koşulur.

#include <chrono>
#include <cstdio>
#include <cstring>
#include <string>

#include "../src/engine.h"
#include "../src/filter.h"

using namespace prizma;

static int g_pass = 0;
static int g_fail = 0;

#define CHECK(cond)                                                          \
  do {                                                                       \
    if (cond) {                                                              \
      ++g_pass;                                                              \
    } else {                                                                 \
      ++g_fail;                                                              \
      std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);            \
    }                                                                        \
  } while (0)

#define CHECK_EQ(a, b)                                                       \
  do {                                                                       \
    if ((a) == (b)) {                                                        \
      ++g_pass;                                                              \
    } else {                                                                 \
      ++g_fail;                                                              \
      std::printf("FAIL %s:%d: %s == %s\n", __FILE__, __LINE__, #a, #b);     \
    }                                                                        \
  } while (0)

static Engine make_engine(const std::string& lists) {
  Engine e;
  e.load_list(lists);
  return e;
}

static int match(const Engine& e, const std::string& url, uint32_t type,
                 const std::string& host, const std::string& doc,
                 bool third = true) {
  return e.match(url, type, host, doc, third).action;
}


void test_helpers() {
  CHECK(is_separator('^'));
  CHECK(is_separator('/'));
  CHECK(is_separator('?'));
  CHECK(is_separator('&'));
  CHECK(is_separator('\0'));
  CHECK(!is_separator('a'));
  CHECK(!is_separator('9'));
  CHECK(!is_separator('_'));
  CHECK(!is_separator('.'));
  CHECK(!is_separator('-'));
  CHECK_EQ(to_lower_ascii("HTTPS://EXAMPLE.COM/X"), "https://example.com/x");
  CHECK(ends_with("example.com", "com"));
  CHECK(!ends_with("example.com", "comx"));
  CHECK(starts_with("||example.com", "||"));
  CHECK(!starts_with("example.com", "||"));
}

void test_parser() {
  // network
  ParseResult r = parse_line("||example.com^", 1);
  CHECK_EQ(r.nets.size(), 1u);
  CHECK(r.nets[0].hostname_anchor);
  CHECK(!r.nets[0].is_exception);
  CHECK_EQ(r.nets[0].pattern, "example.com^");
  CHECK(!r.nets[0].token.empty());

  r = parse_line("@@||ads.example.net^$third-party", 2);
  CHECK_EQ(r.nets.size(), 1u);
  CHECK(r.nets[0].is_exception);
  CHECK_EQ(r.nets[0].party, P_THIRD);
  CHECK(r.nets[0].has_party);

  r = parse_line("||example.com^$domain=foo.com|bar.com,image", 3);
  CHECK_EQ(r.nets.size(), 1u);
  CHECK_EQ(r.nets[0].type_bits, T_IMAGE);
  CHECK_EQ(r.nets[0].domains.size(), 2u);
  CHECK_EQ(r.nets[0].domains[0].name, "foo.com");

  r = parse_line("/ads/banner[0-9]+\\.gif/", 4);
  CHECK_EQ(r.nets.size(), 1u);
  CHECK(r.nets[0].is_regex);
  CHECK_EQ(r.nets[0].regex_src, "ads/banner[0-9]+\\.gif");

  r = parse_line("|https://exact.example.com/|", 5);
  CHECK_EQ(r.nets.size(), 1u);
  CHECK(r.nets[0].anchor_start);
  CHECK(r.nets[0].anchor_end);

  r = parse_line("! yorum satırı", 6);
  CHECK(r.nets.empty());
  CHECK(r.cos.empty());
  r = parse_line("", 7);
  CHECK(r.nets.empty());
  r = parse_line("[Adblock Plus 2.0]", 8);
  CHECK(r.nets.empty());

  r = parse_line("||example.com^$bilinmeyen-opsiyon", 9);
  CHECK(r.nets.empty());  // bilinmeyen seçenek → filtre düşer

  r = parse_line("||example.com^$important", 10);
  CHECK_EQ(r.nets.size(), 1u);
  CHECK(r.nets[0].is_important);

  r = parse_line("||example.com^$badfilter", 11);
  CHECK_EQ(r.nets.size(), 1u);
  CHECK(r.nets[0].is_badfilter);

  // cosmetic
  r = parse_line("##.ad-banner", 12);
  CHECK_EQ(r.cos.size(), 1u);
  CHECK(r.cos[0].is_generic);
  CHECK_EQ(r.cos[0].kind, C_HIDE);
  CHECK_EQ(r.cos[0].selector, ".ad-banner");

  r = parse_line("example.com##.ad", 13);
  CHECK_EQ(r.cos.size(), 1u);
  CHECK(!r.cos[0].is_generic);
  CHECK_EQ(r.cos[0].domains.size(), 1u);
  CHECK_EQ(r.cos[0].domains[0].name, "example.com");

  r = parse_line("example.com,foo.org#@#.ad", 14);
  CHECK_EQ(r.cos.size(), 1u);
  CHECK(r.cos[0].is_exception);
  CHECK_EQ(r.cos[0].domains.size(), 2u);

  r = parse_line("example.com##^#banner", 15);
  CHECK_EQ(r.cos.size(), 1u);
  CHECK_EQ(r.cos[0].kind, C_REMOVE);

  r = parse_line("example.com#$#.banner { display: none !important; }", 16);
  CHECK_EQ(r.cos.size(), 1u);
  CHECK_EQ(r.cos[0].kind, C_STYLE);

  r = parse_line("example.com#%#//scriptlet('set-constant', 'ads', 'false')", 17);
  CHECK_EQ(r.cos.size(), 1u);
  CHECK_EQ(r.cos[0].kind, C_SCRIPTLET);
  CHECK_EQ(r.cos[0].scriptlet_args.size(), 3u);
  CHECK_EQ(r.cos[0].scriptlet_args[0], "set-constant");
  CHECK_EQ(r.cos[0].scriptlet_args[1], "ads");
  CHECK_EQ(r.cos[0].scriptlet_args[2], "false");

  r = parse_line("example.com#?#.x:has(.y)", 18);
  CHECK_EQ(r.cos.size(), 1u);
  CHECK_EQ(r.cos[0].kind, C_PROCEDURAL);
  CHECK_EQ(r.cos[0].op, "has");

  r = parse_line("~example.com##.ad", 19);
  CHECK_EQ(r.cos.size(), 1u);
  CHECK(!r.cos[0].is_generic);
  CHECK(r.cos[0].domains[0].negative);
}

void test_network() {
  Engine e = make_engine(
      "||example.com^\n"
      "||ads.net^$third-party\n"
      "@@||allowed.com^\n"
      "||tracker.io^$domain=news.com\n"
      "/banner[0-9]+\\.gif/\n"
      "@@/banner[0-9]+\\.gif/$domain=news.com\n"
      "|https://exact.com/|\n"
      "example.com/path*images\n"
      "||important.com^$important\n"
      "@@||important.com^\n"
      "@@||allowed.com^$important\n"
      "||cancelled.com^\n"
      "||cancelled.com^$badfilter\n"
      "*popup*ads*\n");

  // hostname anchor
  CHECK_EQ(match(e, "http://example.com/ads", T_IMAGE, "example.com", "foo.com"), 1);
  CHECK_EQ(match(e, "http://www.example.com/ads", T_IMAGE, "www.example.com", "foo.com"), 1);
  CHECK_EQ(match(e, "http://sub.deep.example.com/ads", T_IMAGE, "sub.deep.example.com", "foo.com"), 1);
  CHECK_EQ(match(e, "http://example.org/ads", T_IMAGE, "example.org", "foo.com"), -1);
  CHECK_EQ(match(e, "http://notexample.com/ads", T_IMAGE, "notexample.com", "foo.com"), -1);
  CHECK_EQ(match(e, "http://example.com.evil.org/ads", T_IMAGE, "example.com.evil.org", "foo.com"), -1);

  // third-party
  CHECK_EQ(match(e, "http://ads.net/x.js", T_SCRIPT, "ads.net", "foo.com", true), 1);
  CHECK_EQ(match(e, "http://ads.net/x.js", T_SCRIPT, "ads.net", "ads.net", false), -1);

  // exception
  CHECK_EQ(match(e, "http://allowed.com/x", T_IMAGE, "allowed.com", "foo.com"), 0);
  CHECK_EQ(match(e, "http://www.allowed.com/x", T_IMAGE, "www.allowed.com", "foo.com"), 0);

  // domain seçeneği
  CHECK_EQ(match(e, "http://tracker.io/p", T_XHR, "tracker.io", "news.com"), 1);
  CHECK_EQ(match(e, "http://tracker.io/p", T_XHR, "tracker.io", "other.com"), -1);
  CHECK_EQ(match(e, "http://tracker.io/p", T_XHR, "tracker.io", "sub.news.com"), 1);

  // regex
  CHECK_EQ(match(e, "http://x.com/banner123.gif", T_IMAGE, "x.com", "foo.com"), 1);
  CHECK_EQ(match(e, "http://x.com/banner.gif", T_IMAGE, "x.com", "foo.com"), -1);
  CHECK_EQ(match(e, "http://news.com/banner99.gif", T_IMAGE, "news.com", "news.com"), 0);  // regex exception

  // exact
  CHECK_EQ(match(e, "https://exact.com/", T_DOCUMENT, "exact.com", "foo.com"), 1);
  CHECK_EQ(match(e, "https://exact.com/x", T_DOCUMENT, "exact.com", "foo.com"), -1);

  // wildcard: '*' her şeyle eşleşir; 'images' kısmı zorunlu (izole engine —
  // ||example.com^ ana listede olduğundan burada kendi motorumuzu kuruyoruz)
  {
    Engine ie = make_engine("example.com/path*images\n");
    CHECK_EQ(match(ie, "http://example.com/pathXimages", T_IMAGE, "example.com", "foo.com"), 1);
    CHECK_EQ(match(ie, "http://example.com/pathYimages", T_IMAGE, "example.com", "foo.com"), 1);
    CHECK_EQ(match(ie, "http://example.com/pathXimg", T_IMAGE, "example.com", "foo.com"), -1);
    CHECK_EQ(match(ie, "http://other.org/pathXimages", T_IMAGE, "other.org", "foo.com"), -1);
  }

  // important vs exception: important kazanır
  CHECK_EQ(match(e, "http://important.com/x", T_IMAGE, "important.com", "foo.com"), 1);
  // important exception: her şeyi ezer
  CHECK_EQ(match(e, "http://allowed.com/x", T_IMAGE, "allowed.com", "foo.com"), 0);

  // badfilter
  CHECK_EQ(match(e, "http://cancelled.com/x", T_IMAGE, "cancelled.com", "foo.com"), -1);

  // genel wildcard
  CHECK_EQ(match(e, "http://x.com/popup-ads-banner", T_IMAGE, "x.com", "foo.com"), 1);
}

void test_types() {
  Engine e = make_engine(
      "||example.com^$script\n"
      "||img.net^$image\n"
      "||all.net^\n");
  CHECK_EQ(match(e, "http://example.com/a.js", T_SCRIPT, "example.com", "foo.com"), 1);
  CHECK_EQ(match(e, "http://example.com/a.js", T_IMAGE, "example.com", "foo.com"), -1);
  CHECK_EQ(match(e, "http://img.net/a.png", T_IMAGE, "img.net", "foo.com"), 1);
  CHECK_EQ(match(e, "http://img.net/a.png", T_SCRIPT, "img.net", "foo.com"), -1);
  CHECK_EQ(match(e, "http://all.net/a", T_IMAGE, "all.net", "foo.com"), 1);
  CHECK_EQ(match(e, "http://all.net/a", T_FONT, "all.net", "foo.com"), 1);
}

void test_cosmetic() {
  Engine e = make_engine(
      "##.generic-ad\n"
      "example.com##.specific-ad\n"
      "example.com##.with-style:style(display: none)\n"
      "example.com#$#.styled { color: red !important; }\n"
      "example.com##^#remove-me\n"
      "example.com#%#//scriptlet('set-constant', 'ads', 'false')\n"
      "example.com#?#.proc:has(.child)\n"
      "#@#.generic-ad\n"
      "example.org##.org-only\n"
      "example.com##.also-specific\n"
      "example.com#@#.also-specific\n");

  std::string j = e.cosmetic_json("example.com");
  // generic-ad: exception'ı global olduğu için kaldırılmış olmalı
  CHECK(j.find(".generic-ad") == std::string::npos);
  CHECK(j.find(".specific-ad") != std::string::npos);
  CHECK(j.find("display: none") != std::string::npos);
  CHECK(j.find("color: red") != std::string::npos);
  CHECK(j.find("#remove-me") != std::string::npos);
  CHECK(j.find("set-constant") != std::string::npos);
  CHECK(j.find("proc") != std::string::npos);
  // exception'ı kendi domain'inde
  CHECK(j.find(".also-specific") == std::string::npos);
  CHECK(j.find(".org-only") == std::string::npos);

  // başka host: generic-ad exception'ı burada da etkili (global)
  std::string j2 = e.cosmetic_json("other.com");
  CHECK(j2.find(".generic-ad") == std::string::npos);
  CHECK(j2.find(".specific-ad") == std::string::npos);
  CHECK(j2.find(".org-only") == std::string::npos);

  // example.org kendi filtrelerini alır
  std::string j3 = e.cosmetic_json("example.org");
  CHECK(j3.find(".org-only") != std::string::npos);
  // alt alan adı da specific alır
  std::string j4 = e.cosmetic_json("www.example.com");
  CHECK(j4.find(".specific-ad") != std::string::npos);
  // sahte eşleşme yok
  std::string j5 = e.cosmetic_json("notexample.com");
  CHECK(j5.find(".specific-ad") == std::string::npos);
}

void test_guard() {
  // Vanguard DCP: hostname/path koruma + exception + fusion
  Engine e = make_engine(
      "||ads.example.com^\n"
      "||tracker.net/path1*\n"
      "||img.cdn.net^$image\n"
      "||only-script.net^$script\n"
      "@@||allowed.example.com^\n"
      "||third.example.net^$third-party\n"
      "example.com##.f1\n"
      "example.com##.f2\n"
      "example.com##.f3\n"
      "example.com##.not-fuse:has(x)\n");

  const Guard& g = e.guard();
  // block host
  CHECK_EQ(g.check_host("ads.example.com", G_ANY), 1);
  CHECK_EQ(g.check_host("sub.ads.example.com", G_ANY), 1);
  CHECK_EQ(g.check_host("example.com", G_ANY), -1);
  // exception
  CHECK_EQ(g.check_host("allowed.example.com", G_ANY), 0);
  CHECK_EQ(g.check_host("sub.allowed.example.com", G_ANY), 0);
  // type mask
  CHECK_EQ(g.check_host("img.cdn.net", G_IMAGE), 1);
  CHECK_EQ(g.check_host("img.cdn.net", G_SCRIPT), -1);
  CHECK_EQ(g.check_host("only-script.net", G_SCRIPT), 1);
  CHECK_EQ(g.check_host("only-script.net", G_IMAGE), -1);
  // path rule
  CHECK_EQ(g.check_url("https://tracker.net/path1/x.js", G_SCRIPT), 1);
  CHECK_EQ(g.check_url("https://tracker.net/other.js", G_SCRIPT), -1);
  CHECK_EQ(g.check_url("https://sub.tracker.net/path1/x.js", G_SCRIPT), 1);
  // fusion: .f1,.f2,.f3 :is() grubunda; :has olan ayrı
  std::string j = e.cosmetic_json("example.com");
  CHECK(j.find(":is(.f1,.f2,.f3)") != std::string::npos ||
        j.find(":is(.f3,.f2,.f1)") != std::string::npos ||
        j.find(".f1,.f2,.f3") != std::string::npos);
  CHECK(j.find(".not-fuse") != std::string::npos);

  // export_json JSON formatı ve içerik
  std::string exp = g.export_json();
  CHECK(exp.find("\"h\":") != std::string::npos);
  CHECK(exp.find("\"ads.example.com\"") != std::string::npos);
  CHECK(exp.find("\"a\":") != std::string::npos);
  CHECK(exp.find("\"allowed.example.com\"") != std::string::npos);
  CHECK(exp.find("\"u\":") != std::string::npos);
  CHECK(exp.find("\"tracker.net\"") != std::string::npos);
}

void test_new_features() {
  // ── Teknoloji 2: $removeparam / $queryprune ───────────────────────────────
  ParseResult r = parse_line("||example.com^$removeparam=utm_source", 500);
  CHECK_EQ(r.nets.size(), 1u);
  CHECK(r.nets[0].has_remove_param);
  CHECK_EQ(r.nets[0].remove_param, "utm_source");

  r = parse_line("||example.com^$queryprune=utm_medium", 501);
  CHECK_EQ(r.nets.size(), 1u);
  CHECK(r.nets[0].has_remove_param);
  CHECK_EQ(r.nets[0].remove_param, "utm_medium");

  r = parse_line("*$removeparam", 502);
  CHECK_EQ(r.nets.size(), 1u);
  CHECK(r.nets[0].has_remove_param);
  CHECK(r.nets[0].remove_param.empty());  // boş = tüm parametreler

  // removeparam kuralı ağ engelleme kararı vermez; action=1 olsa da engine
  // kuralı prune olarak raporlar. Engelleme yokken istek geçer.
  {
    Engine e = make_engine("*$removeparam=utm_source\n");
    Engine::MatchResult m = e.match("https://example.com/?a=1&utm_source=x", T_DOCUMENT,
                                    "example.com", "example.com", false);
    CHECK_EQ(m.action, 1);
    CHECK(m.rule_raw.find("removeparam") != std::string::npos);
  }
  // gerçek blok varsa blok kazanır
  {
    Engine e = make_engine("||ads.net^\n||ads.net^$removeparam=utm_source\n");
    Engine::MatchResult m = e.match("https://ads.net/x", T_IMAGE,
                                    "ads.net", "foo.com", true);
    CHECK_EQ(m.action, 1);
    CHECK(m.rule_raw.find("ads.net^") != std::string::npos);
    CHECK(m.rule_raw.find("removeparam") == std::string::npos);
  }
  // guard: removeparam kuralları DCP tablosuna GİRMEMELİ (engelleme değil)
  {
    Engine e = make_engine("||prune-only.net^$removeparam=utm_source\n");
    const Guard& g = e.guard();
    CHECK_EQ(g.check_host("prune-only.net", G_ANY), -1);
  }

  // ── B4: #@#...:style( → C_STYLE exception ─────────────────────────────────
  r = parse_line("example.com#@#.banner:style(display: none !important)", 503);
  CHECK_EQ(r.cos.size(), 1u);
  CHECK(r.cos[0].is_exception);
  CHECK_EQ(r.cos[0].kind, C_STYLE);

  // style exception, aynı selector'ın style kuralını iptal etmeli
  {
    Engine e = make_engine(
        "example.com##.banner:style(display: block !important)\n"
        "example.com#@#.banner:style(display: block !important)\n");
    std::string j = e.cosmetic_json("example.com");
    CHECK(j.find(".banner") == std::string::npos);  // iptal edildi
  }

  // ── B6: anchor_end + sonda '^' — separator ya da URL sonu ─────────────────
  {
    Engine e = make_engine("||example.com/ads^|\n");
    // URL sonu (^ = URL sonu)
    CHECK_EQ(match(e, "https://example.com/ads", T_IMAGE, "example.com", "foo.com"), 1);
    // separator sonu (^ = '/')
    CHECK_EQ(match(e, "https://example.com/ads/", T_IMAGE, "example.com", "foo.com"), 1);
    // eşleşmeyen
    CHECK_EQ(match(e, "https://example.com/ads-extra", T_IMAGE, "example.com", "foo.com"), -1);
    CHECK_EQ(match(e, "https://example.com/ad", T_IMAGE, "example.com", "foo.com"), -1);
  }
  // B6 hostname-anchorsız path (pattern.cpp anchor_end dalı)
  {
    Engine e = make_engine("example.com/ads^|\n");
    CHECK_EQ(match(e, "https://example.com/ads", T_IMAGE, "example.com", "foo.com"), 1);
    CHECK_EQ(match(e, "https://example.com/ads/", T_IMAGE, "example.com", "foo.com"), 1);
    CHECK_EQ(match(e, "https://example.com/ads-x", T_IMAGE, "example.com", "foo.com"), -1);
    CHECK_EQ(match(e, "https://evil.org/x", T_IMAGE, "evil.org", "foo.com"), -1);
  }

  // ── Teknoloji 1: regex dışa aktarımı (JS-Native RegExp köprüsü) ───────────
  {
    // lookbehind/named-group içeren regex C++'ta derlenemez → re_ok=0 → export'a
    // girer (JS-Native RegExp motoru devralır). uBO listelerindeki bu
    // yapılar önceden her istekte derleme hatası verip SESSİZCE atlanıyordu.
    Engine e = make_engine("/ads/(?<!foo)[a-z]+/$");
    std::string j = e.regex_export_json();
    // regex_src'de çıplak kaynak var ('/ads/.../' öneki sıyrılmış)
    CHECK(j.find("(?<!foo)") != std::string::npos);
    CHECK(j.find("\"ok\":0") != std::string::npos);
    CHECK(j.find("\"e\":0") != std::string::npos);
    CHECK(j.find("\"t\":0") != std::string::npos);
    // C++'ta derlenen normal regex export'a girmez (çifte değerlendirme yok)
    Engine e2 = make_engine("/banner[0-9]+\\.gif/\n");
    CHECK_EQ(e2.regex_export_json(), "[]");

    // C++ tarafında eşleşme hâlâ çalışır (derlenebilen regex)
    CHECK_EQ(match(e2, "http://x.com/banner99.gif", T_IMAGE, "x.com", "foo.com"), 1);
    CHECK_EQ(match(e2, "http://x.com/nope.gif", T_IMAGE, "x.com", "foo.com"), -1);
  }

  // ── B2: regex token küçük harf + icase varsayılan ─────────────────────────
  {
    // Büyük harfli regex kaynağı: token ön-filtresi küçük harfli URL ile
    // eşleşebilmeli (token lowercase fix); varsayılan icase regex eşleşmesi.
    Engine e = make_engine("/AdSense/[a-z]+/\n");
    CHECK_EQ(match(e, "http://x.com/adsense/abc", T_SCRIPT, "x.com", "foo.com"), 1);
    CHECK_EQ(match(e, "http://x.com/adsense/xyz", T_SCRIPT, "x.com", "foo.com"), 1);
    CHECK_EQ(match(e, "http://x.com/no-math", T_SCRIPT, "x.com", "foo.com"), -1);
  }

  // ── B1: 128+ fusable selector → tek dev :is() DEĞİL, parçalı gruplar ──────
  {
    Engine e;
    std::string lists;
    for (int i = 0; i < 300; ++i) {
      lists += "##.fuse-" + std::to_string(i) + "\n";
    }
    e.load_list(lists);
    std::string j = e.cosmetic_json("example.com");
    // en az iki :is( grubu olmalı (300 selector 128'lik dilimlerde → en az 3)
    size_t groups = 0, pos = 0;
    while ((pos = j.find(":is(", pos)) != std::string::npos) {
      ++groups;
      pos += 4;
    }
    CHECK(groups >= 3);
    // toplam selector sayısı korunmalı (hiçbiri kaybolmamalı)
    size_t sel_count = 0;
    pos = 0;
    while ((pos = j.find(".fuse-", pos)) != std::string::npos) {
      ++sel_count;
      pos += 6;
    }
    CHECK_EQ(sel_count, 300u);
  }
}

void test_stats() {
  Engine e = make_engine("||example.com^\n##.ad\n");
  CHECK_EQ(e.net_filter_count(), 1u);
  CHECK_EQ(e.cosmetic_filter_count(), 1u);
  std::string s = e.stats_json();
  CHECK(s.find("\"net_filters\":1") != std::string::npos);
  CHECK(s.find("\"cosmetic_filters\":1") != std::string::npos);
}

void test_perf() {
  // ~50K filtre üret ve 20K istek eşle — süreyi raporla
  Engine e;
  std::string lists;
  lists.reserve(8 * 1024 * 1024);
  for (int i = 0; i < 20000; ++i) {
    lists += "||domain" + std::to_string(i) + ".net^$third-party\n";
    lists += "||tracker" + std::to_string(i) + ".io/path" + std::to_string(i) + "*\n";
  }
  lists += "##.ad-" + std::to_string(42) + "\n";

  auto t0 = std::chrono::steady_clock::now();
  e.load_list(lists);
  auto t1 = std::chrono::steady_clock::now();
  const auto load_ms =
      std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();

  int blocked = 0;
  auto t2 = std::chrono::steady_clock::now();
  for (int i = 0; i < 10000; ++i) {
    // eşleşecek istekler (her biri farklı domain)
    const std::string url = "https://tracker" + std::to_string(i % 20000) + ".io/path" +
                            std::to_string(i % 20000) + "/x.js";
    if (e.match(url, T_SCRIPT, "tracker" + std::to_string(i % 20000) + ".io",
                "news.com", true).action == 1) {
      ++blocked;
    }
    // eşleşmeyecek istekler
    e.match("https://clean.example.org/random/path?q=1", T_SCRIPT,
            "clean.example.org", "news.com", false);
  }
  auto t3 = std::chrono::steady_clock::now();
  const auto match_ms =
      std::chrono::duration_cast<std::chrono::milliseconds>(t3 - t2).count();

  CHECK_EQ(e.net_filter_count(), 40000u);
  CHECK_EQ(blocked, 10000);
  std::printf("  perf: 40K filtre yükleme = %ld ms, 20K istek eşleme = %ld ms "
              "(%.1f us/istek)\n",
              (long)load_ms, (long)match_ms,
              match_ms * 1000.0 / 20000.0);
  // gevşek üst sınır: 20K istek 5 sn'den hızlı olmalı (kötü CI'lar için)
  CHECK(match_ms < 5000);
}

int main() {
  test_helpers();
  test_parser();
  test_network();
  test_types();
  test_cosmetic();
  test_guard();
  test_new_features();
  test_stats();
  test_perf();
  std::printf("\n%s: %d geçti, %d başarısız\n",
              g_fail == 0 ? "SONUÇ" : "HATA", g_pass, g_fail);
  return g_fail == 0 ? 0 : 1;
}