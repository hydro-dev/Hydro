module.exports = function () {
  return {
    name: 'provide-plugin',
    async transform({ id, fileExt, contents }) {
      if (fileExt !== '.js' && fileExt !== '.jsx') return contents;
      if (id.includes('/node_modules/jquery.transit/')) {
        return `import jQuery from 'jquery'\n${contents.replace('this, function', '{jQuery}, function')}`;
      }
      if (id.includes('/node_modules/sticky-kit/')) {
        return `import jQuery from 'jquery'\n${contents.replace('$ = this.jQuery || window.jQuery;', '$ = jQuery;')}`;
      }
      if (id.includes('/node_modules/')) {
        if (!/\/(jquery-scroll-lock|jquery\.easing|jquery\.transit)\//.test(id)) return { contents };
      }
      if (contents.includes('$(')) contents = `import $ from 'jquery';\n${contents}`;
      if (contents.includes('jQuery')) contents = `import jQuery from 'jquery';\n${contents}`;
      if (!contents.includes('import React')) {
        if (contents.includes('React.') || fileExt === '.jsx') contents = `import React from 'react';\n${contents}`;
      }
      return contents.replace(/process\.env/g, 'import.meta.env');
    },
  };
};
