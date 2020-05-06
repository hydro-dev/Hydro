# Compilers' Version and Parameters

Hydro使用 [HydroJudger](https://github.com/hydro-dev/HydroJudger) 进行评测，以docker镜像的形式安装至评测机。  
所使用的编译器均为创建镜像时 [debian testing](https://wiki.debian.org/DebianTesting) 分支的最新版。编译参数如下：  

- Free Pascal `fpc -O2 -o/out/foo /in/foo.pas`
- C `gcc -O2 -Wall -std=c99 -o /out/foo /in/foo.c -lm`
- C++ `g++ -O2 -Wall -std=c++11 -o /out/foo /in/foo.cc -lm`
- Java `javac Main.java`
- Python `python foo.py`
- Python 3 `python3 foo.py`
- PHP `php foo.php`
- Rust `rustc -O -o /out/foo /in/foo.rs`
- Haskell `ghc -O -outputdir /tmp -o /out/foo /in/foo.hs`
