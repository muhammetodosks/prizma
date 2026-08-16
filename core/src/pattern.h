#pragma once
// Prizma Pattern Matcher — wildcard + separator (^) + hostname anchor semantiği

#include <string>

namespace prizma {

// '*' wildcard'lı metin eşleştirmesi (tek geçiş, greedy değil).
bool wildcard_match(const char* text, size_t tlen, const char* pat, size_t plen);

// Pattern'deki '^' karakterleri, metin içinde separator (ya da metin sonu) ister.
// text/pat küçük harf olmalı.
bool match_with_separators(const std::string& text, const std::string& pattern);

// Ağ filtresi tam eşleştirmesi. URL küçük harf (match_case=false ise filtre de).
// hostname: URL'nin host kısmı (küçük harf).
struct PatternMatchResult {
  bool matched = false;
};

PatternMatchResult match_network_pattern(const std::string& url_lower,
                                         const std::string& hostname_lower,
                                         const std::string& pattern,
                                         bool anchor_start,
                                         bool anchor_end,
                                         bool hostname_anchor);

// Pattern'i text içinde herhangi bir konumda arar (wildcard + separator).
bool match_substring_pattern(const std::string& text, const std::string& pattern);

}  // namespace prizma