let zIndexCurrent = 1000;

const manager = {
  getCurrent() {
    return zIndexCurrent;
  },
  getNext() {
    return ++zIndexCurrent;
  },
};

export default manager;
