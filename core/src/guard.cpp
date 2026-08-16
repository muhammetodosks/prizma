#include "guard.h"

#include <algorithm>
#include <cctype>
#include <set>

#include "filter.h"

namespace prizma {

uint32_t guard_type_from_typebits(uint32_t type_bits) {
  if (type_bits == 0) return G_ANY;
  uint32_t m = 0;
  if (type_bits & T_IMAGE) m |= G_IMAGE;
  if (type_bits & T_SCRIPT) m |= G_SCRIPT;
  if (type_bits & (T_SUBDOC)) m |= G_IFRAME;
  if (type_bits & (T_OBJECT | T_MEDIA)) m |= G_MEDIA;
  if (type_bits & T_STYLESHEET) m |= G_STYLE;
  if (type_bits & (T_XHR | T_FETCH)) m |= G_XHR;
  return m ? m : G_ANY;
}

namespace {

bool is_hostname_char(char c) {
  return is_ascii_alnum(c) || c == '.' || c == '-' || c == '_';
}

// Filtre pattern'inden hostname + yol önekini çıkarır.
// "hostname_anchor" (||) gereklidir. hostname boş dönerse atla.
std::string extract_hostname_path(const std::string& pattern,
                                  std::string& path_out) {
  path_out.clear();
  size_t i = 0;
  // ilk ayırıcıya kadar hostname: '/' '^' '*' '?' ':'
  while (i < pattern.size() && is_hostname_char(pattern[i])) ++i;
  std::string host = pattern.substr(0, i);
  if (host.empty()) return host;
  // host ':' içerebilir (port) → hostname parçasına al
  size_t colon = host.find(':');
  if (colon != std::string::npos) host = host.substr(0, colon);
  // geri kalan yol: '/' veya '^' ile başlayan kısım
  if (i < pattern.size() && pattern[i] == '/') {
    size_t j = i;
    while (j < pattern.size() && pattern[j] != '*') ++j;
    path_out = pattern.substr(i, j - i);
  } else if (i < pattern.size() && pattern[i] == '^') {
    // '^' ayırıcı. Sonundaki '^' hostname'nin bittiğini gösterir — yol yok.
    // '^/path' veya '^*/path' şeklinde yol varsa URL kuralına dönüşür.
    size_t k = i;
    while (k < pattern.size() && pattern[k] == '^') ++k;
    while (k < pattern.size() && pattern[k] == '*') ++k;  // ^* → wildcard
    if (k < pattern.size() && pattern[k] == '/') {
      size_t j = k;
      while (j < pattern.size() && pattern[j] != '*') ++j;
      path_out = pattern.substr(k, j - k);
    }
  }
  return host;
}

}  // namespace

void Guard::clear() {
  block_.clear();
  allow_.clear();
  urls_.clear();
}

void Guard::add_block(const std::string& host, uint32_t mask) {
  if (host.empty()) return;
  auto it = block_.find(host);
  if (it == block_.end()) block_.emplace(host, mask);
  else it->second |= mask;
}

void Guard::add_allow(const std::string& host, uint32_t mask) {
  if (host.empty()) return;
  auto it = allow_.find(host);
  if (it == allow_.end()) allow_.emplace(host, mask);
  else it->second |= mask;
}

void Guard::build(const std::vector<NetworkFilter>& nets,
                  const std::vector<NetworkFilter>& brute) {
  clear();
  for (const auto& f : nets) {
    if (f.is_regex || f.is_badfilter) continue;
    if (!f.hostname_anchor) continue;  // sadece ||host şekli DCP için güvenilir
    // domain= kısıtı olan kurallar bağlama özeldir; DCP global tabloyu
    // kirletmesin (tam motor zaten domain'e göre karar verir).
    if (!f.domains.empty()) continue;
    std::string path;
    std::string host = extract_hostname_path(f.pattern, path);
    if (host.empty() || host.find('.') == std::string::npos) continue;
    uint32_t mask = guard_type_from_typebits(f.type_bits);
    // path'li kural: tam URL kararı için sakla
    if (!path.empty()) {
      urls_.push_back({host, path, mask, f.is_exception});
      continue;
    }
    if (f.is_exception) add_allow(host, mask);
    else add_block(host, mask);
  }
  for (const auto& f : brute) {
    if (f.is_regex || f.is_badfilter) continue;
    if (!f.hostname_anchor) continue;
    if (!f.domains.empty()) continue;
    std::string path;
    std::string host = extract_hostname_path(f.pattern, path);
    if (host.empty() || host.find('.') == std::string::npos) continue;
    uint32_t mask = guard_type_from_typebits(f.type_bits);
    if (!path.empty()) {
      urls_.push_back({host, path, mask, f.is_exception});
      continue;
    }
    if (f.is_exception) add_allow(host, mask);
    else add_block(host, mask);
  }
}

// host + üst domain sonekleri üzerinde sözlük araması.
static int search_host(const std::unordered_map<std::string, uint32_t>& table,
                       const std::string& hostname, uint32_t guard_type) {
  std::string h = hostname;
  while (!h.empty()) {
    auto it = table.find(h);
    if (it != table.end()) {
      if (it->second == G_ANY || (it->second & guard_type)) return 1;
    }
    size_t dot = h.find('.');
    if (dot == std::string::npos) break;
    h = h.substr(dot + 1);
  }
  return 0;
}

int Guard::check_host(const std::string& hostname_in, uint32_t guard_type) const {
  std::string h = to_lower_ascii(hostname_in);
  // temizle: önde/arkada nokta ve port
  while (!h.empty() && h.front() == '.') h.erase(0, 1);
  size_t colon = h.find(':');
  if (colon != std::string::npos) h = h.substr(0, colon);
  while (!h.empty() && h.back() == '.') h.pop_back();
  if (h.empty()) return -1;

  // exception önce (izin)
  if (search_host(allow_, h, guard_type)) return 0;
  if (search_host(block_, h, guard_type)) return 1;
  return -1;
}

int Guard::check_url(const std::string& url_in, uint32_t guard_type) const {
  // hostname parçasını çöz
  std::string url = url_in;
  size_t scheme = url.find("://");
  std::string host;
  std::string path;
  if (scheme != std::string::npos) {
    size_t start = scheme + 3;
    size_t slash = url.find('/', start);
    size_t q = url.find('?', start);
    size_t end = std::min(slash, q);
    if (end == std::string::npos) end = url.size();
    host = url.substr(start, end - start);
    if (slash != std::string::npos && slash < q) path = url.substr(slash);
  } else {
    // hostsuz: ilk '/' öncesi host
    size_t slash = url.find('/');
    if (slash == std::string::npos) { host = url; }
    else { host = url.substr(0, slash); path = url.substr(slash); }
  }

  int h = check_host(host, guard_type);
  if (h != -1) return h;

  // path önek kuralları (URL yolu ile birlikte)
  if (path.empty()) return -1;
  std::string ph = to_lower_ascii(host);
  // exception path kuralları önce kontrol edilir
  for (const auto& u : urls_) {
    if (!u.allow) continue;
    if (!(u.mask == G_ANY || (u.mask & guard_type))) continue;
    if (ph.size() >= u.host.size() &&
        ph.compare(ph.size() - u.host.size(), u.host.size(), u.host) == 0 &&
        (ph.size() == u.host.size() || ph[ph.size() - u.host.size() - 1] == '.')) {
      if (path.size() >= u.path.size() &&
          path.compare(0, u.path.size(), u.path) == 0) {
        return 0;
      }
    }
  }
  for (const auto& u : urls_) {
    if (u.allow) continue;
    if (!(u.mask == G_ANY || (u.mask & guard_type))) continue;
    // host sonek eşleşmesi
    if (ph.size() >= u.host.size() &&
        ph.compare(ph.size() - u.host.size(), u.host.size(), u.host) == 0 &&
        (ph.size() == u.host.size() || ph[ph.size() - u.host.size() - 1] == '.')) {
      if (path.size() >= u.path.size() &&
          path.compare(0, u.path.size(), u.path) == 0) {
        return 1;
      }
    }
  }
  return -1;
}

std::string Guard::export_json() const {
  // deterministik sıralama için sıralı vektörlere al
  std::vector<std::pair<std::string, uint32_t>> bl(block_.begin(), block_.end());
  std::vector<std::pair<std::string, uint32_t>> al(allow_.begin(), allow_.end());
  std::sort(bl.begin(), bl.end());
  std::sort(al.begin(), al.end());

  auto esc = [](std::string& s, const std::string& in) {
    for (char c : in) {
      if (c == '"' || c == '\\') s += '\\';
      s += c;
    }
  };

  std::string out;
  out += "{\"h\":[";
  bool first = true;
  for (const auto& p : bl) {
    if (!first) out += ",";
    first = false;
    out += "[\"";
    esc(out, p.first);
    out += "\",";
    out += std::to_string(p.second);
    out += "]";
  }
  out += "],\"a\":[";
  first = true;
  for (const auto& p : al) {
    if (!first) out += ",";
    first = false;
    out += "[\"";
    esc(out, p.first);
    out += "\",";
    out += std::to_string(p.second);
    out += "]";
  }
  out += "],\"u\":[";
  first = true;
  for (const auto& u : urls_) {
    if (!first) out += ",";
    first = false;
    out += "[\"";
    esc(out, u.host);
    out += "\",\"";
    esc(out, u.path);
    out += "\",";
    out += std::to_string(u.mask);
    out += ",";
    out += u.allow ? "1" : "0";
    out += "]";
  }
  out += "]}";
  return out;
}

}  // namespace prizma