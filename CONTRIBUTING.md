## Usage of Generative AI

We welcome contributions, including those developed with the assistance of generative AI tools. However, the use of such tools does not change our expectations for contributor responsibility, engagement, or code quality. The following apply to all contributions.

1. Human ownership and accountability
   1. Contributors are responsible for all submitted content, regardless of whether generative AI tools were used.
   2. Contributors must review all the changes before submitting the pull request and be able to explain all changes during review.
   3. Auto submissions are not allowed.
   4. Repeated violations will lead to an account block.
2. Authentic engagement. The pull request process is collaborative and iterative. Contributors are expected to actively engage with reviewer feedback.
3. Consistency with existing style. In the context of Generative AI, this particularly means conveying information (comments, documentation, etc) in a style the reviewer and user will understand.
4. Always keep things simple. Use minimal changes to do the job.

## Source Code

### Backend

TODO

### Frontend

TODO

## Add translation

### Translation file

All translation files are in `packages/*/locale` directory. Those files are in yaml format. You can add a new language by creating a new file with the language id as the file name. For example, if you want to add a new language `ko_KR`, you can create a new file or edit the existing `packages/*/locale/ko_KR.yml` (not `ko-KR.yaml`), in the following format (all comments should be removed): 

```yaml
# packages/*/locale/ko_KR.yml
__id: ko_KR # If you are creating a new language, besure to add this language meta
__langname: 한국어 # Language name in the language itself
key1: value1 # translations
key2: value2
```

Please sort all keys in alphabetical order, ascending. If you are using vscode, you can select all file by Ctrl+A, then use Ctrl-Shift-P to open command palette, and use `sortLinesAscending` action.

Translation for each file should be put into each module seperately. Do not mix them together.

Currently we only accept translations from native speaker. **DO NOT USE MACHINE TRANSLATION.**

### Translation string

Substitution is supported in translation strings (both array-style and object-style).
Key and value should be quoted only when needed.

```yaml
Welcome to {0}, {1}: '{0} 오신 것을 환영합니다, {1}' # array style
Welcome to {place}, {name}: '{place} 오신 것을 환영합니다, {name}' # object style
```

Those translation strings will be used in the following format:

```js
// For backend (in template):
_('Welcome to {0}, {1}').format(place, name)
_('Welcome to {place}, {name}').format({ name, place })

// For backend (in code):
i18n('Welcome to {0}, {1}').format(place, name);
i18n('Welcome to {place}, {name}').format({ place, name });

// For frontend:
substitute(i18n('Welcome to {0}, {1}'), [place, name]);
substitute(i18n('Welcome to {place}, {name}'), { place, name });
```

### Fallback logic

Assume user's language is `ko_KR`. If there is no `ko_KR.yml` file, it will fallback to `ko.yml`. If there is no `ko.yml` file, it will fallback to `en.yml`. If there is no `en.yml` file, it will fallback to the key.
