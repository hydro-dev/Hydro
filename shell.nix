{ 
  pkgs ? import <nixpkgs> {},
  hydro ? import (pkgs.fetchFromGitHub {
    owner = "hydro-dev";
    repo = "nix-channel";
    rev = "e1cb1ea6ac79c5e64bd25036be00ee98e51cfd71";
    hash = "sha256-p7Em18OYAtIsA9+8VtHY1gW/NzRHfHKvoK8rsQRgs5Q=";
  }) {}
}:
let
in pkgs.stdenv.mkDerivation {
  name = "hydro-workspace";
  buildInputs = [
    pkgs.nodejs
    pkgs.yarn
    pkgs.pm2
    pkgs.git
    pkgs.gcc
    hydro.mongodb4
    hydro.sandbox
  ];
}