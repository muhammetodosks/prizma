#pragma once
// Prizma Filter Parser — uBO/Adblock Plus uyumlu filtre sözdizimi

#include <cstdint>
#include <string>
#include <vector>

namespace prizma {

// ─── İstek tipi bitleri (webRequest.ResourceType) ───────────────────────────
enum TypeBit : uint32_t {
  T_NONE       = 0u,
  T_DOCUMENT   = 1u << 0,
  T_SUBDOC     = 1u << 1,
  T_STYLESHEET = 1u << 2,
  T_SCRIPT     = 1u << 3,
  T_IMAGE      = 1u << 4,
  T_OBJECT     = 1u << 5,
  T_MEDIA      = 1u << 6,
  T_XHR        = 1u << 7,
  T_FETCH      = 1u << 8,
  T_FONT       = 1u << 9,
  T_WEBSOCKET  = 1u << 10,
  T_PING       = 1u << 11,
  T_OTHER      = 1u << 12,
};

inline const char* type_bit_name(uint32_t bit) {
  switch (bit) {
    case T_DOCUMENT:   return "document";
    case T_SUBDOC:     return "sub_frame";
    case T_STYLESHEET: return "stylesheet";
    case T_SCRIPT:     return "script";
    case T_IMAGE:      return "image";
    case T_OBJECT:     return "object";
    case T_MEDIA:      return "media";
    case T_XHR:        return "xmlhttprequest";
    case T_FETCH:      return "fetch";
    case T_FONT:       return "font";
    case T_WEBSOCKET:  return "websocket";
    case T_PING:       return "ping";
    case T_OTHER:      return "other";
    default:           return "unknown";
  }
}

// ─── Taraf (party) ───────────────────────────────────────────────────────────
enum Party : uint8_t { P_ANY = 0, P_THIRD = 1, P_FIRST = 2 };

// ─── Domain kuralı (domain= seçeneği ve cosmetic domain listesi) ────────────
struct DomainRule {
  bool negative = false;
  std::string name;  // küçük harf, sonda nokta yok
};

// ─── Ağ filtresi ─────────────────────────────────────────────────────────────
struct NetworkFilter {
  uint32_t id = 0;
  std::string raw;                 // orijinal satır (logger/UI için)
  std::string pattern;             // anchorsız, küçük harf
  bool anchor_start = false;       // |...
  bool anchor_end = false;         // ...|
  bool hostname_anchor = false;    // ||...
  bool is_regex = false;
  bool is_exception = false;       // @@
  bool is_important = false;
  bool is_badfilter = false;
  bool match_case = false;         // match-case seçeneği
  bool has_remove_param = false;   // $removeparam / $queryprune seçeneği
  bool has_party = false;
  uint32_t type_bits = 0;          // 0 = tüm tipler
  uint8_t party = P_ANY;           // P_THIRD / P_FIRST
  std::vector<DomainRule> domains; // doku domain kısıtları (boş = yok)
  std::string regex_src;           // regex kaynağı (derleme JS tarafında değil, C++ tarafında)
  std::string token;               // index token'ı (boş = brute force)
  std::string remove_param;        // $removeparam değeri; boş = tüm parametreler (ad ya da /regex/)
};

// ─── Cosmetic filtre ─────────────────────────────────────────────────────────
enum CosmeticKind : uint8_t {
  C_HIDE = 0,        // ##selector
  C_REMOVE = 1,      // ##^selector  (abp $$)
  C_STYLE = 2,       // #$#  style
  C_SCRIPTLET = 3,   // #%#  //scriptlet(...)
  C_PROCEDURAL = 4,  // #?#  :has() vb.
};

struct CosmeticFilter {
  std::string raw;
  bool is_exception = false;   // #@#
  bool is_generic = true;      // domain kısmı yok
  uint8_t kind = C_HIDE;
  std::vector<DomainRule> domains;  // negatif destekli; boş = generic
  std::string selector;             // CSS selector / style metni / scriptlet çağrısı
  std::vector<std::string> scriptlet_args;  // scriptlet için ayrıştırılmış args
  std::string op;                      // procedural: has|upward|xpath|matches-attr|has-text...
};

// ─── Parse sonucu ────────────────────────────────────────────────────────────
struct ParseResult {
  std::vector<NetworkFilter> nets;
  std::vector<CosmeticFilter> cos;
};

// Sıfırdan büyükse doldurur. Satır boş/yorum ise sonuç boş olur.
ParseResult parse_line(const std::string& line, uint32_t next_id);

// yardımcılar
bool is_ascii_alnum(char c);
bool is_separator(char c);           // ^ anlamındaki ayırıcı
std::string to_lower_ascii(const std::string& s);
bool ends_with(const std::string& s, const std::string& suf);
bool starts_with(const std::string& s, const std::string& pre);

}  // namespace prizma