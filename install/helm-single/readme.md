## 该部署方式非官方维护，仅适用于有经验的K8s集群运维人员修改使用
## 普通用户请务必使用自动脚本安装，这可大大提高您一次成功的可能性

## It is for testing purposes only and is not production-ready.
## TL;DR

首次部署完毕后，不会自动创建用户，请手动在Backend的Pod中执行

```
hydrooj cli user create systemjudge@systemjudge.local root rootroot
hydrooj cli user setSuperAdmin 2
```

Helm Chart示例中尚未完全适配多节点以及HA需求。主要体现在
- Mongo的单节点部署
- 为了理解和调试便利，后端容器`/data/file`和`/root/.hydro`，Mongo容器`/data/db`，评测机容器`/root/.config/hydro`使用了HostPath。


由于Judge需要以特权容器运行（cgroup所需），建议将Backend和Judge调度到不同的节点上。

本部署方式暂不支持本地构建镜像，请根据组织架构场景下的基础设施，自行处理镜像仓库问题。

