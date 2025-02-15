{
  description = "Hydro development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }: 
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      packages.${system}.default = pkgs.hello;
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          pkgs.nodejs
          pkgs.yarn-berry
          pkgs.pm2
          pkgs.git
          pkgs.gcc
          pkgs.go-judge
          pkgs.mongodb-ce
        ];
      };
    };
} 