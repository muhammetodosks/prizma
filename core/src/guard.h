#pragma once
// Prizma Vanguard Guard — Deterministic Creation-Prevention (DCP) için
// senkron, ultra-hızlı DOM koruma indeksi.
//
// Farkı (kimse yapmıyor): reklam öğesi ağı yüklenmeden ÖNCE, DOM prototip
// seviyesinde src/innerHTML/write setter'ları kesilir. Öğe hiç oluşmaz;
// anti-adblock gizlemeyi tespit edemez çünkü gizlenecek bir şey yoktur.

#include <cstdint>
#include <map>
#include <string>
#include <unordered_map>
#include <vector>

#include "filter.h"

namespace prizma {

// Guard tip maskesi: DOM'da oluşturulabilir kaynaklar.
enum GuardType : uint32_t {
  G_IMAGE     = 1u << 0,   // img
  G_SCRIPT    = 1u << 1,   // script
  G_IFRAME    = 1u << 2,   // iframe / sub_frame
  G_MEDIA     = 1u << 3,   // video/audio/embed/object
  G_STYLE     = 1u << 4,   // stylesheet (link)
  G_XHR       = 1u << 5,   // fetch/xhr (link src olmayan, yedek)
  G_ANY       = 0xFFFFFFFFu
};

// G_* maskesini TypeBit'lere çevir (bildirim).
uint32_t guard_type_from_typebits(uint32_t type_bits);

class Guard {
 public:
  // Bir ağ filtresi listesinden hostname/path koruma tablosu inşa eder.
  void build(const std::vector<NetworkFilter>& nets,
             const std::vector<NetworkFilter>& brute);

  // hostname (ve tüm üst domain sonekleri) için koruma kararı.
  //   1 = engelle (DCP kes), 0 = izin (exception), -1 = kural yok
  int check_host(const std::string& hostname, uint32_t guard_type) const;

  // hostname + yol (src URL) için karar. Path önekleri de dikkate alınır.
  int check_url(const std::string& url, uint32_t guard_type) const;

  // Kompakt JSON dışa aktarımı (content script'e):
  //   {"h":[["host",mask],...],"a":[["host",mask],...],"u":[["host","/path",mask],...]}
  // Tümü lowercase, noktasız, üst domainler ayrı kayıt değildir (sonek arama yapılır).
  std::string export_json() const;

  void clear();
  size_t host_count() const { return block_.size(); }
  size_t allow_count() const { return allow_.size(); }
  size_t url_count() const { return urls_.size(); }

 private:
  struct HostRule {
    uint32_t mask = G_ANY;
  };
  struct UrlRule {
    std::string host;      // sonek eşleşir (host + alt alanlar)
    std::string path;      // yol öneki (küçük harf)
    uint32_t mask = G_ANY;
    bool allow = false;    // exception (0 döner) vs block (1 döner)
  };

  std::unordered_map<std::string, uint32_t> block_;   // host -> mask (OR)
  std::unordered_map<std::string, uint32_t> allow_;   // exception host -> mask
  std::vector<UrlRule> urls_;

  void add_block(const std::string& host, uint32_t mask);
  void add_allow(const std::string& host, uint32_t mask);
  static std::string extract_host(const NetworkFilter& f, std::string& path_out);
};

}  // namespace prizma