{ pkgs ? import <nixpkgs> { system = "x86_64-linux"; } }:

let
  mongo = pkgs.callPackage ./mongo.nix {};
in pkgs.buildEnv {
  name = "hydro-env";
  paths = [
    mongo
    pkgs.nodejs
    pkgs.yarn
    pkgs.git
  ];
}