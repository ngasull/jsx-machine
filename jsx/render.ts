import type { Activation } from "../dom.ts";
import { voidElements } from "../dom/void.ts";
import { effect, fn, js, statements, sync, unsafe } from "../js.ts";
import {
  isEvaluable,
  JS,
  JSable,
  JSONable,
  JSStatements,
  jsSymbol,
  ModuleMeta,
  Resource,
} from "../js/types.ts";
import { bundleContext } from "../js/web.ts";
import {
  contextSymbol,
  DOMLiteral,
  DOMNode,
  DOMNodeKind,
  ElementKind,
  JSXContext,
  JSXInitContext,
  JSXRef,
  JSXSyncRef,
} from "./types.ts";

const id = <T>(v: T) => v;

const eventPropRegExp = /^on([A-Z]\w+)$/;

// Only escape when necessary ; avoids inline JS like "a && b" to become "a &amp;&amp; b"
const escapesRegex = /&(#\d{2,4}|[A-z][A-z\d]+);/g;
const escapeEscapes = (value: string) =>
  value.replaceAll(escapesRegex, (_, code) => `&amp;${code};`);

const escapeTag = (tag: string) => tag.replaceAll(/[<>"'&]/g, "");

const zeroWidthSpaceHTML = "&#8203;";

const escapeTextNode = (text: string) =>
  escapeEscapes(text).replaceAll("<", "&lt;") || zeroWidthSpaceHTML; // Empty would not be parsed as a text node

const commentEscapeRegExp = /--(#|>)/g;

const escapeComment = (comment: string) =>
  comment.replaceAll(commentEscapeRegExp, "--#$1");

export const escapeScriptContent = (node: DOMLiteral) =>
  String(node).replaceAll("</script", "</scr\\ipt");

export const renderToString = async (
  root: JSX.Element,
  { context }: { context?: JSXInitContext<unknown>[] } = {},
) => {
  const acc: string[] = [];
  const ctxData = subContext(undefined, context);
  const bundle = new ContextAPIImpl(ctxData).getOrNull(bundleContext);
  const tree = await nodeToDOMTree(root, ctxData);

  writeDOMTree(
    tree,
    (chunk) => acc.push(chunk),
    bundle
      ? ((partial) =>
        writeActivationScript((chunk) => acc.push(chunk), tree, {
          domPath: bundle.lib.dom,
          partial,
        }))
      : null,
  );
  return acc.join("");
};

export const renderToStream = (
  root: JSX.Element,
  { context }: { context?: JSXInitContext<unknown>[] },
) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const write = (chunk: string) =>
        controller.enqueue(encoder.encode(chunk));

      const ctxData = subContext(undefined, context);
      const bundle = new ContextAPIImpl(ctxData).getOrNull(bundleContext);

      nodeToDOMTree(root, ctxData).then((tree) => {
        writeDOMTree(
          tree,
          write,
          bundle
            ? ((partial) =>
              writeActivationScript(write, tree, {
                domPath: bundle.lib.dom,
                partial,
              }))
            : null,
        );
        controller.close();
      });
    },
  });

type ContextData = Map<symbol, unknown>;

export const createContext = <T>(name?: string): JSXContext<T> => {
  const context = (value: T) => [context[contextSymbol], value] as const;
  context[contextSymbol] = Symbol(name);
  return context;
};

const subContext = (
  parent?: ContextData,
  added: JSXInitContext<unknown>[] = [],
): ContextData => {
  const sub = new Map(parent);
  for (const [k, v] of added) {
    sub.set(k, v);
  }
  return sub;
};

class ContextAPIImpl {
  constructor(private readonly data: ContextData) {}

  get<T>(context: JSXContext<T>) {
    if (!this.data.has(context[contextSymbol])) {
      throw new Error(`Looking up unset context`);
    }
    return this.data.get(context[contextSymbol]) as T;
  }

  getOrNull<T>(context: JSXContext<T>) {
    return this.data.get(context[contextSymbol]) as T | null;
  }

  has<T>(context: JSXContext<T>) {
    return this.data.has(context[contextSymbol]);
  }

  set<T>(context: JSXContext<T>, value: T) {
    this.data.set(context[contextSymbol], value);
    return this;
  }

  delete<T>(context: JSXContext<T>) {
    this.data.delete(context[contextSymbol]);
    return this;
  }
}

const writeActivationScript = (
  write: (chunk: string) => void,
  children: DOMNode[],
  { domPath, partial = false }: {
    domPath: string;
    partial?: boolean;
  },
) => {
  const [activation, modules, store] = deepActivation(children);
  if (activation.length) {
    write("<script>(p=>");
    write(
      js.import<typeof import("../dom.ts")>(domPath).then((dom) =>
        dom.a(
          activation,
          modules,
          store,
          js<NodeList | Node[]>`p`,
        )
      )[jsSymbol].rawJS,
    );
    write(")(");
    write(
      partial
        ? `[document.currentScript.previousSibling]`
        : `document.childNodes`,
    );
    write(")</script>");
  }
};

export const deepActivation = (
  root: DOMNode[],
): [Activation, string[], [string, JSONable][]] => {
  const modules: Record<string, 1> = {};
  const storeModule = ({ pub }: ModuleMeta) => {
    modules[pub] = 1;
  };

  const activationStore: Record<string, [number, JSONable]> = {};
  let storeIndex = 0;
  const store = ({ uri }: Resource<JSONable>, value: JSONable) => {
    activationStore[uri] ??= [storeIndex++, value];
    return activationStore[uri][0];
  };
  return [
    domActivation(root, storeModule, store),
    Object.keys(modules),
    Object.entries(activationStore).map(([uri, [, value]]) => [uri, value]),
  ];
};

const domActivation = (
  dom: readonly DOMNode[],
  storeModule: (m: ModuleMeta) => void,
  store: (resource: Resource<JSONable>, value: JSONable) => number,
) => {
  const activation: Activation = [];

  for (let i = 0; i < dom.length; i++) {
    const { kind, node, refs = [] } = dom[i];
    for (const ref of refs) {
      for (const m of ref.fn[jsSymbol].modules) {
        storeModule(m);
      }

      const { body } = ref.fn[jsSymbol];
      const refFnBody = Array.isArray(body)
        ? statements(body as JSStatements<unknown>)
        : body as JSable<unknown>;

      activation.push([
        i,
        refFnBody[jsSymbol].rawJS,
        ...(ref.fn[jsSymbol].resources?.map((r, i) =>
          store(r, ref.values[i])
        ) ??
          []),
      ]);
    }
    if (kind === DOMNodeKind.Tag) {
      const childrenActivation = domActivation(
        node.children,
        storeModule,
        store,
      );
      if (childrenActivation.length > 0) {
        activation.push([i, childrenActivation]);
      }
    }
  }

  return activation;
};

const writeDOMTree = (
  tree: readonly DOMNode[],
  write: (chunk: string) => void,
  writeRootActivation: ((partial?: boolean) => void) | null,
  root = true,
) => {
  const partialRoot = root && (tree.length !== 1 ||
    tree[0].kind !== DOMNodeKind.Tag || tree[0].node.tag !== "html");

  for (const { kind, node } of tree) {
    switch (kind) {
      case DOMNodeKind.Comment: {
        write(`<!--`);
        write(escapeComment(node));
        write(`-->`);
        break;
      }

      case DOMNodeKind.Tag: {
        if (partialRoot && node.tag !== "script") {
          write("<html><body>");
        }

        write("<");
        write(escapeTag(node.tag));

        for (const [name, value] of Object.entries(node.attributes)) {
          if (value === false) continue;
          const valueStr = value === true ? "" : String(value);

          write(" ");
          write(escapeTag(name));
          write("=");
          const escapedValue = escapeEscapes(valueStr).replaceAll("'", "&#39;");
          if (!escapedValue || /[\s>"]/.test(escapedValue)) {
            write("'");
            write(escapedValue);
            write("'");
          } else {
            write(escapedValue);
          }
        }

        write(">");

        if (!(node.tag in voidElements)) {
          if (node.tag === "script") {
            for (const c of node.children) {
              if (c.kind === DOMNodeKind.Text) {
                write(escapeScriptContent(c.node.text));
              } else {
                console.warn(`<script> received non-text child: ${c}`);
              }
            }
          } else {
            writeDOMTree(node.children, write, writeRootActivation, false);

            if (!partialRoot && node.tag === "head") {
              writeRootActivation?.();
            }
          }

          write("</");
          write(node.tag);
          write(">");
        }

        if (partialRoot && node.tag !== "script") {
          writeRootActivation?.(true);
          write("</body></html>");
        }
        break;
      }

      case DOMNodeKind.Text: {
        write(escapeTextNode(node.text));
        break;
      }

      case DOMNodeKind.HTMLNode: {
        write(node.html);
        break;
      }
    }
  }
};

const nodeToDOMTree = async (
  root: JSX.Element,
  ctxData: ContextData,
): Promise<DOMNode[]> => {
  const syncRoot = await root;

  if (Array.isArray(syncRoot)) {
    const children = await Promise
      .all(syncRoot.map((child) => nodeToDOMTree(child, ctxData)))
      .then((children) => children.flatMap(id));

    // Make sure we have no adjacent text nodes (would be parsed as only one)
    for (let i = children.length - 1; i > 0; i--) {
      if (
        children[i].kind === DOMNodeKind.Text &&
        children[i - 1].kind === DOMNodeKind.Text
      ) {
        children.splice(i, 0, { kind: DOMNodeKind.Comment, node: "" });
      }
    }

    return children;
  }

  switch (syncRoot.kind) {
    case ElementKind.Component: {
      const { Component, props } = syncRoot.element;
      const subCtxData = subContext(ctxData);
      return nodeToDOMTree(
        Component(props, new ContextAPIImpl(subCtxData)),
        subCtxData,
      );
    }

    case ElementKind.Comment: {
      return [{ kind: DOMNodeKind.Comment, node: syncRoot.element }];
    }

    case ElementKind.Intrinsic: {
      const {
        tag,
        props: { ref, ...props },
        children,
      } = syncRoot.element;

      const attributes: Record<string, string | number | boolean> = {};
      const reactiveAttributes: [
        string,
        JSable<string | number | boolean | null>,
      ][] = [];
      const refs: JSXSyncRef<Element>[] = ref
        ? [
          await sync(
            fn((elRef: JS<Element>) =>
              (ref as unknown as JSXRef<Element>)(elRef) as JSable<void>
            ),
          ),
        ]
        : [];

      const propEntries = Object.entries(props);
      let entry;
      while ((entry = propEntries.shift())) {
        const [name, value] = entry;
        await (async function recordAttr(
          name: string,
          value:
            | string
            | number
            | boolean
            | null
            | undefined
            | JSable<string | number | boolean | null>,
        ) {
          if (value != null) {
            const eventMatch = name.match(eventPropRegExp);
            if (eventMatch) {
              const eventType = eventMatch[1].toLowerCase();
              refs.push(
                await sync(fn((elRef: JS<Element>) =>
                  effect(() => [
                    js`let c=${value}`,
                    elRef.addEventListener(eventType, unsafe("c")),
                    js.return(() =>
                      elRef.removeEventListener(eventType, unsafe("c"))
                    ),
                  ])
                )),
              );
            } else if (isEvaluable<string | number | boolean | null>(value)) {
              await recordAttr(name, await js.eval(value));
              reactiveAttributes.push([name, value]);
            } else {
              attributes[name] = value;
            }
          }
        })(name, value);
      }

      refs.push(
        ...(await Promise.all(
          reactiveAttributes.map(([name, reactive]) =>
            sync(
              fn((node: JS<Element>) =>
                effect(() =>
                  js`let k=${name},v=${reactive};!v&&v!==""?${node}.removeAttribute(k):${node}.setAttribute(k,v===true?"":String(v))`
                )
              ),
            )
          ),
        )),
      );

      return [
        {
          kind: DOMNodeKind.Tag,
          node: {
            tag: tag,
            attributes,
            children: await nodeToDOMTree(children, ctxData),
          },
          refs,
        },
      ];
    }

    case ElementKind.JS: {
      return [
        {
          kind: DOMNodeKind.Text,
          node: {
            text: String(await js.eval(syncRoot.element)),
          },
          refs: [
            await sync(
              fn((node: JS<Text>) =>
                effect(() => js`${node}.textContent=${(syncRoot.element)}`)
              ),
            ),
          ],
        },
      ];
    }

    case ElementKind.Text: {
      return [
        {
          kind: DOMNodeKind.Text,
          node: { text: String(syncRoot.element.text) },
          refs: syncRoot.element.ref
            ? [
              await sync(
                fn((ref) => syncRoot.element.ref!(ref) as JSable<void>),
              ),
            ]
            : [],
        },
      ];
    }

    case ElementKind.HTMLNode: {
      return [
        {
          kind: DOMNodeKind.HTMLNode,
          node: { html: syncRoot.element.html },
          refs: syncRoot.element.ref
            ? [
              await sync(
                fn((ref) => syncRoot.element.ref!(ref) as JSable<void>),
              ),
            ]
            : [],
        },
      ];
    }
  }

  throw Error(`Can't handle JSX node ${JSON.stringify(syncRoot)}`);
};
