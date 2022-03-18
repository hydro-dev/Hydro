import yaml from 'js-yaml'

export default function reducer(state = { type: 'default' }, action) {
  switch (action.type) {
  case 'CONFIG_LOAD_CONFIG_FULFILLED': {
    // TODO set yaml schema
    return yaml.load(action.payload.config) || state;
  }
  default:
    return state;
  }
}
