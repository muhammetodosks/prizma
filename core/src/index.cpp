#include "index.h"

namespace prizma {

void TokenIndex::add(const std::string& token, uint32_t id) {
  if (token.size() < 4) return;
  map_[token].push_back(id);
}

const std::vector<uint32_t>* TokenIndex::find(const std::string& token) const {
  auto it = map_.find(token);
  return it == map_.end() ? nullptr : &it->second;
}

void TokenIndex::clear() { map_.clear(); }

size_t TokenIndex::size() const { return map_.size(); }

}  // namespace prizma