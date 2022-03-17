{ pkgs ? import <nixpkgs> { system = "x86_64-linux"; } }:

let
  mongo = pkgs.callPackage ./mongo.nix {};
in pkgs.dockerTools.buildImage {
  name = "hydrooj/web-base";
  tag = "latest";

  contents = [
    mongo
    pkgs.minio
    pkgs.nodejs
    pkgs.yarn
  ];

  config = {
    WorkingDir = "/data";
    Volumes = { "/data" = { }; };
    ExposedPorts = {
      "8888" = { };
    };
    Cmd = [ "hydrooj" ];
  };
}