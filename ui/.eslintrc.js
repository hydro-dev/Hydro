const path = require('path');

module.exports = {
  "parser": "babel-eslint",
  "plugins": [
    "babel",
    "react"
  ],
  "env": {
    "browser": true,
    "es6": true,
    "jquery": true,
    "commonjs": true
  },
  "extends": [
    "airbnb"
  ],
  "parserOptions": {
    "sourceType": "module",
    "ecmaVersion": 7,
    "ecmaFeatures": {
      "impliedStrict": true,
      "experimentalObjectRestSpread": true,
      "jsx": true,
      "legacyDecorators": true
    }
  },
  "settings": {
    "import/resolver": {
      "webpack": {
        "config": {
          "resolve": {
            "alias": {
              "vj": path.resolve(__dirname),
            }
          }
        }
      }
    }
  },
  "globals": {
    "__webpack_public_path__": true,
    "__webpack_require__": true,
    "UiContext": true,
    "UserContext": true,
    "Context": true,
    "LOCALES": true
  },
  "rules": {
    "comma-dangle": [
      "error",
      "always-multiline"
    ],
    "indent": [
      "error",
      2,
      {
        "SwitchCase": 0
      }
    ],
    "max-len": [
      "error",
      150
    ],
    "quotes": "warn",
    "func-names": "off",
    "class-methods-use-this": "off",
    "consistent-return": "warn",
    "no-restricted-syntax": "warn",
    "no-unused-vars": "warn",
    "no-console": "off",
    "no-continue": "off",
    "no-mixed-operators": "off",
    "no-plusplus": "off",
    "no-underscore-dangle": "off",
    "no-await-in-loop": "off",
    "no-lonely-if": "off",
    "import/first": "off",
    "react/prefer-stateless-function": "off",
    "react/self-closing-comp": "off",
    "react/prop-types": "off",
    "react/jsx-filename-extension": "off",
    "react/jsx-one-expression-per-line": "off",
    "react/no-string-refs": "off",
    "react/require-default-props": "off",
    "react/react-in-jsx-scope": "off",
    "react/destructuring-assignment": "off",
    "react/button-has-type": "off",
    "react/forbid-prop-types": "off",
    "jsx-a11y/no-static-element-interactions": "off",
    "jsx-a11y/anchor-is-valid": "off",
    "jsx-a11y/click-events-have-key-events": "off"
  }
};
