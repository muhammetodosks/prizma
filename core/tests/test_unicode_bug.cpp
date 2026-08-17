#include "engine.h"
#include <cstdio>
#include <string>

using namespace prizma;

int main() {
  Engine eng;
  // japonca cosmetic + marker net kuralı
  std::string cos = "facebook.com##a[aria-label=\"\xE5\xBA\x83\xE5\x91\x8A\"]\n";  // 広告
  std::string marker = "||zzmarker.net^\n";
  eng.load_list(cos + marker);  // TEK çağrı — WASM testindeki gibi
  printf("cos=%d net=%d regex=%d\n", eng.cosmetic_filter_count(),
         eng.net_filter_count(), eng.regex_filter_count());
  auto r = eng.match("http://zzmarker.net/x", T_SCRIPT, "zzmarker.net",
                     "www.example.com", true);
  printf("marker match action=%d prio=%d\n", r.action, r.priority);
  // kontrol: marker'ı önce yükle
  Engine eng2;
  eng2.load_list(marker);
  auto r2 = eng2.match("http://zzmarker.net/x", T_SCRIPT, "zzmarker.net",
                       "www.example.com", true);
  printf("kontrol action=%d prio=%d\n", r2.action, r2.priority);
  return 0;
}