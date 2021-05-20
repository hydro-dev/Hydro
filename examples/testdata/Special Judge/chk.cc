#include "testlib.h"
#include <cmath>

int main(int argc, char *argv[]) {
  /*
   * inf：输入
   * ouf：选手输出
   * ans：标准输出
   */
  registerTestlibCmd(argc, argv);
  double pans = ouf.readDouble(), jans = ans.readDouble();
  if (pans == jans) quitf(_ok, "Good job\n");
  else quitf(_wa, "Too big or too small, expected %f, found %f\n", jans, pans);
}
