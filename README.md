react 源码调试

src/react
根目录
├── fixtures # 包含一些给贡献者准备的小型 React 测试项目
├── packages # 包含元数据（比如 package.json）和 React 仓库中所有 package 的源码（子目录 src）
├── scripts # 各种工具链的脚本，比如git、jest、eslint等

源码中其他模块公用的方法和全局变量，比如在shared/ReactSymbols.js中保存React不同组件类型的定义。

```js
// ...
export let REACT_ELEMENT_TYPE = 0xeac7;
export let REACT_PORTAL_TYPE = 0xeaca;
export let REACT_FRAGMENT_TYPE = 0xeacb;
// ...
```

- react-art
- react-dom # 注意这同时是DOM和SSR（服务端渲染）的入口
- react-native-renderer
- react-noop-renderer # 用于debug fiber（后面会介绍fiber）
- react-test-renderer
- react-server # 创建自定义SSR流
- react-client # 创建自定义的流
- react-fetch # 用于数据请求
- react-interactions # 用于测试交互相关的内部特性，比如React的事件模型
- react-reconciler # Reconciler的实现，你可以用他构建自己的Renderer
- react-is # 用于测试组件是否是某类型
- react-client # 创建自定义的流
- react-fetch # 用于数据请求
- react-refresh # “热重载”的React官方实现

# react-reconciler 模块 react16 后的核心模块
