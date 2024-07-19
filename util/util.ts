// Const

const gbl = globalThis;

const Array = gbl.Array;
const DOMParser = gbl.DOMParser;
const JSON = gbl.JSON;
const Object = gbl.Object;

export const TRUE: true = !0;
export const FALSE: false = !TRUE;
export const NULL: null = null;
export const UNDEFINED: undefined = void 0;

export const doc = gbl.document;
export const Promise = gbl.Promise;
export const $ = gbl.Symbol;
export const win = gbl.window;
export const location = gbl.location;

export const routeLoadEvent = "route-load";

// FP

export const call = <T>(cb: () => T): T => cb();

export const first = <T>(a: readonly [T, ...any[]]): T => a[0];

export const last = <T>(a: readonly T[]): T => a[length(a) - 1];

export const forEach = <
  T extends Record<"forEach", (...item: readonly any[]) => any>,
>(
  iterable: T | null | undefined,
  cb: T extends Record<"forEach", (cb: infer Cb) => void> ? Cb : never,
): void => iterable?.forEach(cb);

export const forOf = <T>(
  iterable: Iterable<T>,
  cb: (item: T) => unknown,
): void => {
  for (let i of iterable) cb(i);
};

export const reverseForOf = <T>(
  iterable: Iterable<T>,
  cb: (item: T) => unknown,
): void => {
  let arr = [...iterable], i = arr.length - 1;
  for (; i >= 0; i--) cb(arr[i]);
};

export const id = <T>(v: T): T => v;

export const isFunction = <T extends Function>(v: unknown): v is T =>
  typeof v == "function";

export const isString = (v: unknown): v is string => typeof v === "string";

export const length = (lengthy: { length: number }) => lengthy.length;

export const memo1 = <Fn extends (arg: any) => any>(
  fn: Fn,
): Fn & { del: (a: Parameters<Fn>[0]) => boolean } => {
  let cache = new WeakMap(),
    m = ((arg) => (
      !cache.has(arg) && cache.set(arg, fn(arg)), cache.get(arg)
    )) as Fn & { del: (a: Parameters<Fn>[0]) => boolean };
  m.del = (arg: Parameters<Fn>[0]) => cache.delete(arg);
  return m;
};

export const noop = (): void => {};

export const popR = <T>(arr: T[]): T[] => (arr.pop(), arr);

export const pushR = <T>(arr: T[], ...v: T[]): T[] => (arr.push(...v), arr);

export const toLowerCase = (str: string): string => str.toLowerCase();

export const isArray = Array.isArray;

export const arraySlice = Array.prototype.slice;

export const parse = JSON.parse;

export const assign = Object.assign;
export const defineProperties = Object.defineProperties;
export const entries = Object.entries;
export const freeze = Object.freeze;
export const fromEntries = Object.fromEntries;
export const getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
export const keys = Object.keys;
export const values = Object.values;

// DOM

const domParser = DOMParser && new DOMParser();

export const domParse = (html: string): Document =>
  domParser.parseFromString(html, "text/html");

export const html = (
  xml: string,
): ChildNode[] => [...domParse(xml).body.childNodes];

export const adoptNode = <T extends Node>(node: T): T => doc.adoptNode(node);

export const cloneNode = <T extends Node>(node: T): T =>
  node.cloneNode(TRUE) as T;

export const dataset = (el: HTMLElement | SVGElement): DOMStringMap =>
  el.dataset;

export const dispatchPrevented = (el: EventTarget, event: Event): boolean => (
  el.dispatchEvent(event), event.defaultPrevented
);

export const ifDef = <T, U>(v: T, cb: (v: NonNullable<T>) => U): T | U =>
  v == null ? (v as Exclude<T, NonNullable<T>>) : cb(v);

export const insertBefore = (
  parent: Node,
  node: Node,
  child: Node | null,
): Node => parent.insertBefore(node, child);

export const preventDefault = (e: Event): void => e.preventDefault();

export const querySelector = <E extends Element>(
  selector: string,
  node: ParentNode = doc.body,
): E | null => node.querySelector<E>(selector);

export const querySelectorAll = <E extends Element>(
  selector: string,
  node: ParentNode = doc.body,
): NodeListOf<E> => node.querySelectorAll<E>(selector);

export const remove = <Args extends readonly unknown[], R>(
  el: { readonly remove: (...args: Args) => R },
  ...args: Args
): R => el.remove(...args);

export const replaceWith = (
  el: ChildNode,
  ...node: readonly (Node | string)[]
): void => el.replaceWith(...node);

export const stopPropagation = (e: Event): void => e.stopPropagation();

type Deep<T> = T | readonly Deep<T>[];

export const deepMap = <T, R>(v: Deep<T>, cb: (v: T) => R): R[] =>
  isArray(v) ? deepMap_(v, cb) as R[] : [cb(v as T)];

const deepMap_ = <T, R>(v: Deep<T>, cb: (v: T) => R): R | R[] =>
  isArray(v) ? v.flatMap((v) => deepMap_(v, cb)) : cb(v as T);

const camelRegExp = /[A-Z]/g;

export const hyphenize = (camel: string): string =>
  camel.replace(
    camelRegExp,
    (l: string) => "-" + l.toLowerCase(),
  );

export const global = <T>(name: string, init: T): { (): T; (v: T): T } => {
  let $accessor = $.for(name),
    getSet = (...args: [] | [T]) =>
      // @ts-ignore wrapped in this function to avoid overloading global types
      length(args) ? gbl[$accessor] = args[0] : gbl[$accessor];

  if (!($accessor in gbl)) getSet(init);

  return getSet;
};

export type EventType<T> =
  & (undefined extends T ? { (detail?: T): CustomEvent<T> }
    : { (detail: T): CustomEvent<T> })
  & { readonly type: string };

const eventTypeIndex = global("cc.eti", 0);

export const eventType = <T = undefined>(
  { type, ...opts }: CustomEventInit<T> & { type?: string } = {},
): EventType<T> => {
  let t = type ?? "cc" + eventTypeIndex(eventTypeIndex() + 1),
    factory: ((detail: T) => CustomEvent<T>) & { type?: string } = (
      detail: T,
    ) =>
      new CustomEvent(t, { bubbles: TRUE, cancelable: TRUE, detail, ...opts });
  factory.type = t;
  return factory as EventType<T>;
};

export const listen = <
  T extends EventTarget,
  K extends string | EventType<any>,
>(
  target: T,
  event: K,
  cb: (
    this: T,
    e: K extends EventType<infer ET> ? CustomEvent<ET>
      : T extends Window
        ? K extends keyof WindowEventMap ? WindowEventMap[K] : Event
      : K extends keyof HTMLElementEventMap ? HTMLElementEventMap[K]
      : Event,
  ) => void,
  options?: boolean | AddEventListenerOptions | undefined,
): () => void => {
  let type = isString(event) ? event : event.type;
  target.addEventListener(
    type,
    cb as Parameters<typeof target["addEventListener"]>[1],
    options,
  );
  return () =>
    target.removeEventListener(
      type,
      cb as Parameters<typeof target["removeEventListener"]>[1],
      options,
    );
};
