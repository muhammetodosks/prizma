#include "pattern.h"

#include "filter.h"

namespace prizma {

bool wildcard_match(const char* text, size_t tlen, const char* pat, size_t plen) {
  // Recursive greedy-değil eşleştirme — pattern ve metin kısa olduğundan
  // yığın derinliği sınırlıdır; '*'-lık arama ileri kaydırma ile yapılır.
  size_t t = 0, p = 0;
  size_t star_t = 0, star_p = SIZE_MAX;  // son '*' pozisyonları
  while (t < tlen) {
    if (p < plen && (pat[p] == '?' || pat[p] == text[t])) {
      ++p;
      ++t;
    } else if (p < plen && pat[p] == '*') {
      star_t = t;
      star_p = p;
      ++p;
    } else if (star_p != SIZE_MAX) {
      // geri dön: '*' bir karakter daha yer
      t = ++star_t;
      p = star_p + 1;
    } else {
      return false;
    }
  }
  while (p < plen && pat[p] == '*') ++p;
  return p == plen;
}

bool match_with_separators(const std::string& text, const std::string& pattern) {
  // '^' bir ayırıcı karakter ister (ya da metin sonu) ve o karakteri tüketir.
  // '*' wildcard; diğerleri birebir (küçük harf varsayılır).
  const size_t tlen = text.size();
  const size_t plen = pattern.size();
  size_t t = 0, p = 0;
  size_t star_t = 0, star_p = SIZE_MAX;
  while (t < tlen) {
    if (p >= plen) break;  // pattern tükendi → eşleşme
    char pc = pattern[p];
    if (pc == '^') {
      if (is_separator(text[t])) {
        ++p;
        ++t;  // ayırıcı karakteri tüket
      } else if (star_p != SIZE_MAX) {
        t = ++star_t;
        p = star_p + 1;
      } else {
        return false;
      }
    } else if (pc == '*') {
      star_t = t;
      star_p = p;
      ++p;
    } else if (pc == text[t]) {
      ++p;
      ++t;
    } else if (star_p != SIZE_MAX) {
      t = ++star_t;
      p = star_p + 1;
    } else {
      return false;
    }
  }
  while (p < plen) {
    char pc = pattern[p];
    if (pc == '*') {
      ++p;
    } else if (pc == '^') {
      // pattern sonunda '^' → metin sonu da ayırıcı sayılır
      ++p;
    } else {
      break;
    }
  }
  return p == plen;
}

PatternMatchResult match_network_pattern(const std::string& url,
                                         const std::string& hostname,
                                         const std::string& pattern,
                                         bool anchor_start,
                                         bool anchor_end,
                                         bool hostname_anchor) {
  PatternMatchResult r;
  if (pattern.empty()) return r;

  if (hostname_anchor) {
    // '||': pattern hostname başlangıcına hizalanır.
    //  1) pattern'in hostname kısmı = pattern'de '/', '*', '^', '?' ilk görülen yer
    //  2) hostname == hostpart veya hostname ".hostpart" ile bitmeli
    //  3) pattern'in geri kalanı (path) url'nin hostname'den sonrasıyla wildcard eşleşmeli
    size_t cut = pattern.size();
    for (size_t i = 0; i < pattern.size(); ++i) {
      char c = pattern[i];
      if (c == '/' || c == '*' || c == '^') {
        cut = i;
        break;
      }
    }
    const std::string hostpart = pattern.substr(0, cut);
    if (hostpart.empty()) {
      // || gibi geçersiz — genel wildcard gibi davran
      r.matched = wildcard_match(url.data(), url.size(), pattern.data(), pattern.size());
      return r;
    }
    bool host_ok = hostname == hostpart;
    if (!host_ok && hostname.size() > hostpart.size()) {
      host_ok = hostname[hostname.size() - hostpart.size() - 1] == '.' &&
                hostname.compare(hostname.size() - hostpart.size(), hostpart.size(), hostpart) == 0;
    }
    if (!host_ok) return r;

    if (cut == pattern.size()) {
      // pattern tamamen hostname — path yok
      r.matched = true;
      return r;
    }
    // hostname'den sonraki url kısmı: scheme'den sonra hostname gelir
    size_t hstart = 0;
    const size_t sch = url.find("://");
    if (sch != std::string::npos) hstart = sch + 3;
    if (url.size() <= hstart + hostname.size()) return r;
    const std::string rest = url.substr(hstart + hostname.size());
    r.matched = match_with_separators(rest, pattern.substr(cut));
    return r;
  }

  if (anchor_start && anchor_end) {
    r.matched = url == pattern;
    return r;
  }
  if (anchor_start) {
    if (url.size() < pattern.size()) return r;
    r.matched = url.compare(0, pattern.size(), pattern) == 0;
    return r;
  }
  if (anchor_end) {
    if (url.size() < pattern.size()) return r;
    r.matched = url.compare(url.size() - pattern.size(), pattern.size(), pattern) == 0;
    return r;
  }
  // genel: substring + separator/wildcard (pattern text içinde herhangi bir yerde)
  r.matched = match_substring_pattern(url, pattern);
  return r;
}

bool match_substring_pattern(const std::string& text, const std::string& pattern) {
  const size_t meta = pattern.find_first_of("*^");
  if (meta == std::string::npos) {
    return text.find(pattern) != std::string::npos;
  }
  if (meta == 0) {
    for (size_t i = 0; i <= text.size(); ++i) {
      if (match_with_separators(text.substr(i), pattern)) return true;
    }
    return false;
  }
  const std::string prefix = pattern.substr(0, meta);
  size_t pos = 0;
  while ((pos = text.find(prefix, pos)) != std::string::npos) {
    if (match_with_separators(text.substr(pos), pattern.substr(meta))) return true;
    pos += 1;
  }
  return false;
}

}  // namespace prizma