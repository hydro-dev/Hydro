// 首次初始化脚本（只在数据目录为空时由官方 entrypoint 执行一次）
//
// 做什么：在 hydro 库里写一条初始化标记，方便确认脚本确实跑过。
// 不做什么：不建业务集合、不改认证、不动权限 —— Hydro 自己会建表，
// 提前建空集合反而可能让它的 schema 初始化逻辑判断出错。
//
// 需要额外初始化（例如建只读账号、预置某些集合）时，在本目录新增
// 20-xxx.js 之类的文件即可，文件名决定执行顺序。

const marker = db.getSiblingDB('hydro').hgnu_init;
if (marker.countDocuments({ _id: 'hgnu-init' }) === 0) {
  marker.insertOne({
    _id: 'hgnu-init',
    initializedAt: new Date(),
    note: 'created by hgnu-mongodb initdb script',
  });
  print('[hgnu-init] wrote marker document into hydro.hgnu_init');
} else {
  print('[hgnu-init] marker already present, nothing to do');
}
