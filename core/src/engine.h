#pragma once
// Prizma Engelleme Motoru — C++/WASM çekirdeği

#include <cstdint>
#include <regex>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "filter.h"
#include "guard.h"
#include "index.h"

namespace prizma {

class Engine {
 public:
  Engine() = default;
  ~Engine() = default;
  Engine(const Engine&) = delete;
  Engine(Engine&&) = default;
  Engine& operator=(const Engine&) = delete;

  // Debug logging: PRIZMA_DEBUG=1 ortam değişkeniyle aktif edilir.
  // Eşleşen kural, öncelik, domain sonucu detaylı loglanır.
  static void set_debug(bool enabled) { debug_enabled_ = enabled; }
  static bool debug_enabled() { return debug_enabled_; }

  // Filtre listesi metnini yükler (çoğul çağrı birleştirir).
  void load_list(const std::string& text);
  void clear();

  size_t net_filter_count() const { return nets_.size(); }
  size_t regex_filter_count() const { return regexes_.size(); }
  size_t cosmetic_filter_count() const { return cos_.size(); }
  uint64_t match_count() const { return matches_; }
  uint64_t blocked_count() const { return blocked_; }

  // ── Ağ eşleştirme ─────────────────────────────────────────────────────────
  // action: 1 = engelle, 0 = izin (exception), -1 = eşleşme yok
  struct MatchResult {
    int action = -1;
    std::string rule_raw;   // eşleşen kural metni (logger için)
    bool from_regex = false;
    int priority = -1;      // 3=allow_imp, 2=block_imp, 1=allow, 0=block, -1=yok
    // Dinamik kural/heuristik bilgisi (v1.2.0)
    bool from_heuristic = false;
    int heuristic_score = 0;
  };
  MatchResult match(const std::string& url, uint32_t type_bit,
                    const std::string& hostname,
                    const std::string& doc_hostname,
                    bool third_party) const;

  // ── Dinamik Kural / Heuristik Motoru (v1.2.0) ─────────────────────────────
  // İstek davranışını analiz eder, şüpheli istekleri skorlar,
  // ve dinamik engelleme kuralları üretir.
  struct HeuristicConfig {
    int min_score_threshold = 70;      // Engelleme eşiği (0-100)
    int max_tracked_domains = 10000;   // İzlenen domain sayısı limiti
    int request_window_sec = 60;       // İstek penceresi (saniye)
    int min_requests_for_scoring = 3;  // Skorlama için min istek sayısı
    bool enable_ml_scoring = true;     // ML tabanlı skorlama aktif
    bool auto_generate_rules = true;   // Otomatik kural üretimi
  };
  
  // Heuristik motoru yapılandırmasını günceller
  void set_heuristic_config(const HeuristicConfig& config);
  
  // Belirli bir domain için dinamik kural getirir (varsa)
  std::string get_dynamic_rule_for_domain(const std::string& domain) const;
  
  // Tüm dinamik kuralları JSON olarak döndürür
  std::string dynamic_rules_json() const;
  
  // Heuristik istatistikleri
  std::string heuristic_stats_json() const;

  // ── Cosmetic ──────────────────────────────────────────────────────────────
  // hostname için uygulanacak cosmetic filtreleri JSON olarak döndürür.
  std::string cosmetic_json(const std::string& hostname) const;

  // ── Regex dışa aktarımı (JS-Native RegExp motoru) ─────────────────────────
  // C++ std::regex'in desteklemediği (lookahead/lookbehind/named-group vb.)
  // regex filtreleri JS'e devretmek için JSON array döndürür.
  // Her eleman: {s:src, raw, e:exception, i:important, m:match_case,
  //              t:type_bits, p:party, hp:has_party, d:[[name,neg]...],
  //              ok:re_ok, tok:token}
  std::string regex_export_json() const;

  // Son eşleşmenin önceliği (3=allow_imp, 2=block_imp, 1=allow, 0=block, -1=yok)
  int last_priority() const { return last_priority_; }

  // ── Vanguard Guard (DCP) ──────────────────────────────────────────────────
  // hostname/path/yol öneki tablosu (prototip-seviyesi DOM kesintisi için).
  const Guard& guard() const { return guard_; }
  void rebuild_guard() { guard_.build(nets_, brute_); }

  // ── İstatistik ────────────────────────────────────────────────────────────
  std::string stats_json() const;

 private:
  static bool debug_enabled_;

  struct RegexFilter {
    uint32_t id;
    std::string raw;
    std::string src;
    bool is_exception;
    bool is_important;
    bool match_case;
    uint32_t type_bits;
    uint8_t party;
    bool has_party;
    std::vector<DomainRule> domains;
    std::string token;
    std::regex re;      // load_list'te bir kez derlenir (performans)
    bool re_ok = false; // derleme başarılı mı? (false → JS tarafına devreder)
  };

  // ── Heuristik/Dinamik Kural Yapıları (v1.2.0) ─────────────────────────────
  struct DomainHeuristics {
    std::string domain;
    int total_requests = 0;
    int blocked_requests = 0;
    int script_requests = 0;
    int xhr_requests = 0;
    int fetch_requests = 0;
    int third_party_requests = 0;
    int unique_paths = 0;
    int suspicious_params = 0;  // utm_, fbclid, gclid, _ga, _gid, mc_, _ym_...
    int heuristic_score = 0;    // 0-100
    int last_seen = 0;          // unix timestamp
    std::unordered_map<std::string, int> path_counts;
  };
  
  
  HeuristicConfig heuristic_config_;
  mutable std::unordered_map<std::string, DomainHeuristics> domain_heuristics_;
  mutable std::unordered_map<std::string, std::string> dynamic_rules_;  // domain -> rule
  mutable int last_cleanup_time_ = 0;
  
  // Heuristik skor hesaplama
  int calculate_heuristic_score(const DomainHeuristics& h) const;
  
  // Domain heuristiklerini güncelle
  void update_domain_heuristics(const std::string& url, uint32_t type_bit,
                                const std::string& hostname,
                                const std::string& doc_hostname,
                                bool third_party) const;
  
  // Dinamik kural üret
  void maybe_generate_dynamic_rule(const std::string& domain) const;
  
  // Eski verileri temizle
  void cleanup_old_heuristics() const;


  
  std::vector<NetworkFilter> nets_;        // id-ordered (index)
  std::vector<NetworkFilter> brute_;       // token'sız normal filtreler
  std::vector<RegexFilter> regexes_;       // regex filtreler
  std::vector<NetworkFilter> badfilters_;  // badfilter kuralları
  std::vector<CosmeticFilter> cos_;
  TokenIndex index_;
  Guard guard_;
  mutable uint64_t matches_ = 0;
  mutable uint64_t blocked_ = 0;
  mutable int last_priority_ = -1;

  bool check_options(const NetworkFilter& f, uint32_t type_bit,
                     const std::string& doc_hostname, bool third_party) const;
  bool check_domains(const std::vector<DomainRule>& rules,
                     const std::string& host) const;
  bool filter_cancelled(const NetworkFilter& f) const;
  bool is_badfilter_match(const NetworkFilter& a, const NetworkFilter& b) const;
  void collect_cosmetic(std::vector<const CosmeticFilter*>& out,
                        const std::string& hostname, bool generic) const;
  void append_json_escape(std::string& out, const std::string& s) const;
  static void append_json_str(std::string& out, const std::string& s);
};

}  // namespace prizma
