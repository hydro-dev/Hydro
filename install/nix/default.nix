{ pkgs ? import <nixpkgs> { system = "x86_64-linux"; } }:

let
  hydro = import (pkgs.fetchFromGitHub {
    owner = "hydro-dev";
    repo = "nix-channel";
    rev = "master";
    sha256 = "sha256-EqPU9n4H3EteJqFFv6Seeo9DZxFc3Mdu8Y1y/fjZJ80=";
  }) {};
in pkgs.dockerTools.buildImage {
  name = "hydrooj/web-base";
  tag = "latest";

  copyToRoot = pkgs.buildEnv {
    name = "hydro-web";
    paths = [
      hydro.mongodb4
      pkgs.nodejs
      pkgs.yarn
    ];
    ignoreCollisions = true;
    pathsToLink = [ "/bin" ];
  };

  config = {
    WorkingDir = "/data";
    Volumes = { "/data" = { }; };
    ExposedPorts = {
      "8888" = { };
    };
    Cmd = [ "hydrooj" ];
  };
}