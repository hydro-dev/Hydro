{
  description = "Hydro development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        composeConfig = {
          version = "0.5";
          processes = {
            hydro = {
              command = "${pkgs.nodejs}/bin/node node_modules/.bin/hydrooj --debug --port=2333";
              is_interactive = true;
            };
            go-judge = {
              command = "${pkgs.go-judge}/bin/go-judge";
            };
            webpack = {
              command = "${pkgs.yarn-berry}/bin/yarn build:ui:dev";
            };
          };
        };
      in
      {
        apps.default = {
          type = "app";
          program = "${pkgs.writeShellScript "compose.sh" ''
            ${pkgs.process-compose}/bin/process-compose -f ${pkgs.writeText "process-compose.yml" (builtins.toJSON composeConfig)}
          ''}";
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs
            yarn-berry
            gcc
            go-judge
          ];
        };
      });
}
