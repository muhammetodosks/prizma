#pragma once
// Prizma Token Index — token → filtre id haritası

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace prizma {

class TokenIndex {
 public:
  void add(const std::string& token, uint32_t id);
  // Token'ı arar; yoksa nullptr. (id listesi)
  const std::vector<uint32_t>* find(const std::string& token) const;
  void clear();
  size_t size() const;

 private:
  std::unordered_map<std::string, std::vector<uint32_t>> map_;
};

}  // namespace prizma