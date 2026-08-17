// Prizma WASM C ABI — JS tarafına dışa aktarılan fonksiyonlar
// Tüm string'ler UTF-8; dönüşler motor ömrü boyunca geçerli static tamponda.

#include <cstring>

#include "engine.h"

using prizma::Engine;

extern "C" {

static Engine* g_engine = nullptr;
static char g_out[65536];
static bool g_out_owned = false;

// Yeni motor (tek örnek; tekil yeterli).
void* prizma_new() {
  if (g_engine == nullptr) g_engine = new Engine();
  return g_engine;
}

void prizma_free(void* h) {
  if (h == g_engine) {
    delete g_engine;
    g_engine = nullptr;
  }
}

// Filtre listesi metnini yükle (len bayt).
void prizma_load_list(const char* text, int len) {
  if (!g_engine || !text || len <= 0) return;
  g_engine->load_list(std::string(text, static_cast<size_t>(len)));
}

void prizma_clear() {
  if (g_engine) g_engine->clear();
}

int prizma_net_filter_count() {
  return g_engine ? static_cast<int>(g_engine->net_filter_count()) : 0;
}

int prizma_regex_filter_count() {
  return g_engine ? static_cast<int>(g_engine->regex_filter_count()) : 0;
}

int prizma_cosmetic_filter_count() {
  return g_engine ? static_cast<int>(g_engine->cosmetic_filter_count()) : 0;
}

// Ağ eşleştirme:
//   url, hostname, doc_hostname: null-terminated
//   type_bit: TypeBit değeri
//   third_party: 0/1
// Dönüş: 1 = engelle, 0 = izin (exception), -1 = eşleşme yok
// Eşleşen kural metni prizma_last_rule() ile alınır.
int prizma_match(const char* url, int type_bit, const char* hostname,
                 const char* doc_hostname, int third_party) {
  if (!g_engine || !url) return -1;
  Engine::MatchResult r = g_engine->match(
      url, static_cast<uint32_t>(type_bit),
      hostname ? hostname : "", doc_hostname ? doc_hostname : "",
      third_party != 0);
  if (r.action != -1 && !r.rule_raw.empty()) {
    if (r.rule_raw.size() + 1 <= sizeof(g_out)) {
      std::memcpy(g_out, r.rule_raw.data(), r.rule_raw.size());
      g_out[r.rule_raw.size()] = '\0';
    }
  }
  return r.action;
}

const char* prizma_last_rule() { return g_out; }

// Son eşleşmenin önceliği: 3=allow_imp, 2=block_imp, 1=allow, 0=block, -1=yok.
// JS-Native RegExp motoru WASM sonucuyla aynı anda kendi regex eşleşmelerini
// değerlendirirken öncelikleri karşılaştırmak için kullanılır (senkron çağrı
// zincirinde güvenlidir — match() ile arada await yoktur).
int prizma_match_priority() {
  return g_engine ? g_engine->last_priority() : -1;
}

// JS-Native RegExp motoruna devredilen (C++'ın derleyemediği, lookahead vb.)
// regex filtrelerini JSON array olarak dışa aktarır. Çağıran taraf `out`
// tamponunu verir; sığmazsa -1. (Büyük listeler için cap esaslı güvenli taşıma.)
int prizma_regex_export(char* out, int cap) {
  if (!g_engine || !out || cap <= 0) return -1;
  std::string j = g_engine->regex_export_json();
  if (j.size() + 1 > static_cast<size_t>(cap)) return -1;
  std::memcpy(out, j.data(), j.size());
  out[j.size()] = '\0';
  return static_cast<int>(j.size());
}

// Cosmetic filtre JSON'u (hostname için).
// Cosmetic filtre JSON'u (hostname için).
// Çağıran taraf `out` tamponunu ve kapasitesini verir; dönüş JSON uzunluğudur
// (tampon sığmazsa -1). Böylece büyük cosmetic çıktıları (ör. YouTube) güvenle taşınır.
int prizma_cosmetic(const char* hostname, char* out, int cap) {
  if (!g_engine || !out || cap <= 0) return -1;
  std::string j = g_engine->cosmetic_json(hostname ? hostname : "");
  if (j.size() + 1 > static_cast<size_t>(cap)) return -1;
  std::memcpy(out, j.data(), j.size());
  out[j.size()] = '\0';
  return static_cast<int>(j.size());
}

const char* prizma_stats() {
  if (!g_engine) return "{}";
  std::string j = g_engine->stats_json();
  if (j.size() + 1 <= sizeof(g_out)) {
    std::memcpy(g_out, j.data(), j.size());
    g_out[j.size()] = '\0';
    return g_out;
  }
  return "{}";
}

// ── Vanguard Guard (DCP) ─────────────────────────────────────────────────────
// hostname/path koruma kararı. content script'e senkron dağıtılan guard JSON'u
// kadar hızlıdır; background'da webRequest öncesi hızlı elemek için de kullanılır.
int prizma_guard_check_host(const char* hostname, int guard_type) {
  if (!g_engine || !hostname) return -1;
  return g_engine->guard().check_host(hostname, static_cast<uint32_t>(guard_type));
}

int prizma_guard_check_url(const char* url, int guard_type) {
  if (!g_engine || !url) return -1;
  return g_engine->guard().check_url(url, static_cast<uint32_t>(guard_type));
}

// Guard indeksini JSON olarak dışa aktarır (content script DCP için).
int prizma_guard_export(char* out, int cap) {
  if (!g_engine || !out || cap <= 0) return -1;
  std::string j = g_engine->guard().export_json();
  if (j.size() + 1 > static_cast<size_t>(cap)) return -1;
  std::memcpy(out, j.data(), j.size());
  out[j.size()] = '\0';
  return static_cast<int>(j.size());
}

int prizma_guard_host_count() {
  return g_engine ? static_cast<int>(g_engine->guard().host_count()) : 0;
}

int prizma_guard_allow_count() {
  return g_engine ? static_cast<int>(g_engine->guard().allow_count()) : 0;
}

}  // extern "C"