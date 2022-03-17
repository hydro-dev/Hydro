{ pkgs ? import <nixpkgs> {} }:

pkgs.stdenv.mkDerivation {
  name = "hydro-0.0.0";
  system = "x86_64-linux";
  #TODO install from cache
  src = ../../.yarn/cache;
  unpackPhase = "ls $src";

  meta = {
    description = "Hydro";
    homepage = https://hydro.js.org/;
    maintainers = [ "undefined <i@undefined.moe>" ];
    platforms = [ "x86_64-linux" ];
  };
}
