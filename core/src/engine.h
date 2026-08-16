#pragma once
// Prizma Engelleme Motoru — C++/WASM çekirdeği

#include <cstdint>
#include <string>
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
  };
  MatchResult match(const std::string& url, uint32_t type_bit,
                    const std::string& hostname,
                    const std::string& doc_hostname,
                    bool third_party) const;

  // ── Cosmetic ──────────────────────────────────────────────────────────────
  // hostname için uygulanacak cosmetic filtreleri JSON olarak döndürür.
  std::string cosmetic_json(const std::string& hostname) const;

  // ── Vanguard Guard (DCP) ──────────────────────────────────────────────────
  // hostname/path/yol öneki tablosu (prototip-seviyesi DOM kesintisi için).
  const Guard& guard() const { return guard_; }
  void rebuild_guard() { guard_.build(nets_, brute_); }

  // ── İstatistik ────────────────────────────────────────────────────────────
  std::string stats_json() const;

 private:
  struct RegexFilter {
    uint32_t id;
    std::string raw;
    std::string src;
    bool is_exception;
    bool is_important;
    uint32_t type_bits;
    uint8_t party;
    bool has_party;
    std::vector<DomainRule> domains;
    std::string token;
  };


  std::vector<NetworkFilter> nets_;        // id-ordered (index)
  std::vector<NetworkFilter> brute_;       // token'sız normal filtreler
  std::vector<RegexFilter> regexes_;       // regex filtreler
  std::vector<NetworkFilter> badfilters_;  // badfilter kuralları
  std::vector<CosmeticFilter> cos_;
  TokenIndex index_;
  Guard guard_;
  mutable uint64_t matches_ = 0;
  mutable uint64_t blocked_ = 0;

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