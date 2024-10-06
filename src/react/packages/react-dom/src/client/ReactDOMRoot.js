/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {MutableSource, ReactNodeList} from 'shared/ReactTypes';
import type {
  FiberRoot,
  TransitionTracingCallbacks,
} from 'react-reconciler/src/ReactInternalTypes';

import {queueExplicitHydrationTarget} from '../events/ReactDOMEventReplaying';
import {REACT_ELEMENT_TYPE} from 'shared/ReactSymbols';

export type RootType = {
  render(children: ReactNodeList): void,
  unmount(): void,
  _internalRoot: FiberRoot | null,
  ...
};

export type CreateRootOptions = {
  unstable_strictMode?: boolean,
  unstable_concurrentUpdatesByDefault?: boolean,
  identifierPrefix?: string,
  onRecoverableError?: (error: mixed) => void,
  transitionCallbacks?: TransitionTracingCallbacks,
  ...
};

export type HydrateRootOptions = {
  // Hydration options
  hydratedSources?: Array<MutableSource<any>>,
  onHydrated?: (suspenseNode: Comment) => void,
  onDeleted?: (suspenseNode: Comment) => void,
  // Options for all roots
  unstable_strictMode?: boolean,
  unstable_concurrentUpdatesByDefault?: boolean,
  identifierPrefix?: string,
  onRecoverableError?: (error: mixed) => void,
  ...
};

import {
  isContainerMarkedAsRoot,
  markContainerAsRoot,
  unmarkContainerAsRoot,
} from './ReactDOMComponentTree';
import {listenToAllSupportedEvents} from '../events/DOMPluginEventSystem';
import {
  ELEMENT_NODE,
  COMMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
} from '../shared/HTMLNodeType';

import {
  createContainer,
  createHydrationContainer,
  updateContainer,
  findHostInstanceWithNoPortals,
  registerMutableSourceForHydration,
  flushSync,
  isAlreadyRendering,
} from 'react-reconciler/src/ReactFiberReconciler';
import {ConcurrentRoot} from 'react-reconciler/src/ReactRootTags';
import {
  allowConcurrentByDefault,
  disableCommentsAsDOMContainers,
} from 'shared/ReactFeatureFlags';

/* global reportError */
const defaultOnRecoverableError =
  typeof reportError === 'function'
    ? // In modern browsers, reportError will dispatch an error event,
      // emulating an uncaught JavaScript error.
    reportError
    : (error: mixed) => {
      // In older browsers and test environments, fallback to console.error.
      // eslint-disable-next-line react-internal/no-production-logging
      console['error'](error);
    };

function ReactDOMRoot(internalRoot: FiberRoot) {
  // 存储应用根节点[FiberRootNode]
  this._internalRoot = internalRoot;
}
// 原型链上定义render方法
ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render = function (
  children: ReactNodeList,
): void {
  const root = this._internalRoot;
  if (root === null) {
    throw new Error('Cannot update an unmounted root.');
  }

  if (__DEV__) {
    if (typeof arguments[1] === 'function') {
      console.error(
        'render(...): does not support the second callback argument. ' +
        'To execute a side effect after rendering, declare it in a component body with useEffect().',
      );
    } else if (isValidContainer(arguments[1])) {
      console.error(
        'You passed a container to the second argument of root.render(...). ' +
        "You don't need to pass it again since you already passed it to create the root.",
      );
    } else if (typeof arguments[1] !== 'undefined') {
      console.error(
        'You passed a second argument to root.render(...) but it only accepts ' +
        'one argument.',
      );
    }

    const container = root.containerInfo;

    if (container.nodeType !== COMMENT_NODE) {
      const hostInstance = findHostInstanceWithNoPortals(root.current);
      if (hostInstance) {
        if (hostInstance.parentNode !== container) {
          console.error(
            'render(...): It looks like the React-rendered content of the ' +
            'root container was removed without using React. This is not ' +
            'supported and will cause errors. Instead, call ' +
            "root.unmount() to empty a root's container.",
          );
        }
      }
    }
  }
  // 开始加载react应用 children为App根组件, root为应用根节点对象FiberRootNode
  /**
   * react组件都会被转换为react-element对象:
   * {
   *    $$typeof: Symbol(react.element),
   *    key: null,
   *    props: {},
   *    ref: null,
   *    type: fun App() {}
   * }
   *
   */
  updateContainer(children, root, null, null);
};
// 原型链上定义unmount方法
ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount = function (): void {
  if (__DEV__) {
    if (typeof arguments[0] === 'function') {
      console.error(
        'unmount(...): does not support a callback argument. ' +
        'To execute a side effect after rendering, declare it in a component body with useEffect().',
      );
    }
  }
  const root = this._internalRoot;
  if (root !== null) {
    this._internalRoot = null;
    const container = root.containerInfo;
    if (__DEV__) {
      if (isAlreadyRendering()) {
        console.error(
          'Attempted to synchronously unmount a root while React was already ' +
          'rendering. React cannot finish unmounting the root until the ' +
          'current render has completed, which may lead to a race condition.',
        );
      }
    }
    flushSync(() => {
      updateContainer(null, root, null, null);
    });
    unmarkContainerAsRoot(container);
  }
};

export function createRoot(
  container: Element | Document | DocumentFragment,
  options?: CreateRootOptions,
): RootType {
  // 校验container是否合法
  if (!isValidContainer(container)) {
    throw new Error('createRoot(...): Target container is not a DOM element.');
  }

  // 开发环境校验警告
  warnIfReactDOMContainerInDEV(container);

  // 严格模式默认为false
  let isStrictMode = false;
  let concurrentUpdatesByDefaultOverride = false;
  let identifierPrefix = '';
  let onRecoverableError = defaultOnRecoverableError;
  let transitionCallbacks = null;

  if (options !== null && options !== undefined) {
    if (__DEV__) {
      if ((options: any).hydrate) {
        console.warn(
          'hydrate through createRoot is deprecated. Use ReactDOMClient.hydrateRoot(container, <App />) instead.',
        );
      } else {
        if (
          typeof options === 'object' &&
          options !== null &&
          (options: any).$$typeof === REACT_ELEMENT_TYPE
        ) {
          console.error(
            'You passed a JSX element to createRoot. You probably meant to ' +
            'call root.render instead. ' +
            'Example usage:\n\n' +
            '  let root = createRoot(domContainer);\n' +
            '  root.render(<App />);',
          );
        }
      }
    }
    if (options.unstable_strictMode === true) {
      isStrictMode = true;
    }
    if (
      allowConcurrentByDefault &&
      options.unstable_concurrentUpdatesByDefault === true
    ) {
      concurrentUpdatesByDefaultOverride = true;
    }
    if (options.identifierPrefix !== undefined) {
      identifierPrefix = options.identifierPrefix;
    }
    if (options.onRecoverableError !== undefined) {
      onRecoverableError = options.onRecoverableError;
    }
    if (options.transitionCallbacks !== undefined) {
      transitionCallbacks = options.transitionCallbacks;
    }
  }
  // 注：ConcurrentRoot为1，代表了v18版本的并发渲染模式
  // 1、创建FiberRootNode应用根节点对象。
  // 2、创建HostFiber虚拟DOM树根节点对象。
  // 3、关联两个对象，可以互相访问。
  // 4、初始化HostFiber的updateQueue属性。
  // 5、返回FiberRootNode节点。
  const root = createContainer(
    container,
    ConcurrentRoot, // 1 默认开启并发模式
    null,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
    identifierPrefix,
    onRecoverableError,
    transitionCallbacks,
  );
  // 给#root DOM元素设置一个内部属性，存储root.current 即HostFiber对象
  markContainerAsRoot(root.current, container);

  const rootContainerElement: Document | Element | DocumentFragment =
    container.nodeType === COMMENT_NODE
      ? (container.parentNode: any)
      : container;
  // 监听[#root dom元素]的所有事件
  // 1、在#root根元素上绑定所有的事件回调，任何子孙元素触发的改类型事件都会委托给【根元素的事件回调】处理。
  // 2、寻找触发事件的dom元素，找到对应的FiberNode节点。
  // 3、收集从当前FiberNode节点到HostFiber之间的所有注册该事件的回调函数。
  // 4、循环执行一次收集的所有回调函数。
  listenToAllSupportedEvents(rootContainerElement);
  //创建ReactDOMRoot实例对象并返回 将root应用根节点对象 存储为ReactDOM的内部对象
  return new ReactDOMRoot(root);
}

function ReactDOMHydrationRoot(internalRoot: FiberRoot) {
  this._internalRoot = internalRoot;
}

function scheduleHydration(target: Node) {
  if (target) {
    queueExplicitHydrationTarget(target);
  }
}

ReactDOMHydrationRoot.prototype.unstable_scheduleHydration = scheduleHydration;

export function hydrateRoot(
  container: Document | Element,
  initialChildren: ReactNodeList,
  options?: HydrateRootOptions,
): RootType {
  if (!isValidContainer(container)) {
    throw new Error('hydrateRoot(...): Target container is not a DOM element.');
  }

  warnIfReactDOMContainerInDEV(container);

  if (__DEV__) {
    if (initialChildren === undefined) {
      console.error(
        'Must provide initial children as second argument to hydrateRoot. ' +
        'Example usage: hydrateRoot(domContainer, <App />)',
      );
    }
  }

  // For now we reuse the whole bag of options since they contain
  // the hydration callbacks.
  const hydrationCallbacks = options != null ? options : null;
  // TODO: Delete this option
  const mutableSources = (options != null && options.hydratedSources) || null;

  let isStrictMode = false;
  let concurrentUpdatesByDefaultOverride = false;
  let identifierPrefix = '';
  let onRecoverableError = defaultOnRecoverableError;
  if (options !== null && options !== undefined) {
    if (options.unstable_strictMode === true) {
      isStrictMode = true;
    }
    if (
      allowConcurrentByDefault &&
      options.unstable_concurrentUpdatesByDefault === true
    ) {
      concurrentUpdatesByDefaultOverride = true;
    }
    if (options.identifierPrefix !== undefined) {
      identifierPrefix = options.identifierPrefix;
    }
    if (options.onRecoverableError !== undefined) {
      onRecoverableError = options.onRecoverableError;
    }
  }

  const root = createHydrationContainer(
    initialChildren,
    null,
    container,
    ConcurrentRoot,
    hydrationCallbacks,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
    identifierPrefix,
    onRecoverableError,
    // TODO(luna) Support hydration later
    null,
  );
  markContainerAsRoot(root.current, container);
  // This can't be a comment node since hydration doesn't work on comment nodes anyway.
  listenToAllSupportedEvents(container);

  if (mutableSources) {
    for (let i = 0; i < mutableSources.length; i++) {
      const mutableSource = mutableSources[i];
      registerMutableSourceForHydration(root, mutableSource);
    }
  }

  return new ReactDOMHydrationRoot(root);
}

export function isValidContainer(node: any): boolean {
  return !!(
    node &&
    (node.nodeType === ELEMENT_NODE ||
      node.nodeType === DOCUMENT_NODE ||
      node.nodeType === DOCUMENT_FRAGMENT_NODE ||
      (!disableCommentsAsDOMContainers &&
        node.nodeType === COMMENT_NODE &&
        (node: any).nodeValue === ' react-mount-point-unstable '))
  );
}

// TODO: Remove this function which also includes comment nodes.
// We only use it in places that are currently more relaxed.
export function isValidContainerLegacy(node: any): boolean {
  return !!(
    node &&
    (node.nodeType === ELEMENT_NODE ||
      node.nodeType === DOCUMENT_NODE ||
      node.nodeType === DOCUMENT_FRAGMENT_NODE ||
      (node.nodeType === COMMENT_NODE &&
        (node: any).nodeValue === ' react-mount-point-unstable '))
  );
}

function warnIfReactDOMContainerInDEV(container: any) {
  if (__DEV__) {
    if (
      container.nodeType === ELEMENT_NODE &&
      ((container: any): Element).tagName &&
      ((container: any): Element).tagName.toUpperCase() === 'BODY'
    ) {
      console.error(
        'createRoot(): Creating roots directly with document.body is ' +
        'discouraged, since its children are often manipulated by third-party ' +
        'scripts and browser extensions. This may lead to subtle ' +
        'reconciliation issues. Try using a container element created ' +
        'for your app.',
      );
    }
    if (isContainerMarkedAsRoot(container)) {
      if (container._reactRootContainer) {
        console.error(
          'You are calling ReactDOMClient.createRoot() on a container that was previously ' +
          'passed to ReactDOM.render(). This is not supported.',
        );
      } else {
        console.error(
          'You are calling ReactDOMClient.createRoot() on a container that ' +
          'has already been passed to createRoot() before. Instead, call ' +
          'root.render() on the existing root instead if you want to update it.',
        );
      }
    }
  }
}
