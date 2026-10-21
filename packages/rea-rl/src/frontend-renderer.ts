import type { WebPageInspection } from "../../../src/domain/browserObservationSchemas.js";

type AxNode = WebPageInspection["accessibility"]["nodes"][number];
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const roleOf = (node: AxNode) => (node.role ?? "").toLowerCase();
const inputRoles = new Set([
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "switch",
  "combobox",
  "listbox",
]);
const flattenedRoles = new Set([
  "rootwebarea",
  "webarea",
  "none",
  "presentation",
  "generic",
  "inlinetextbox",
]);

function buildTree(nodes: AxNode[]) {
  const byId = new Map<string, number>();
  nodes.forEach((node, i) => {
    if (byId.has(node.node_id))
      throw new Error("Duplicate accessibility node identity");
    byId.set(node.node_id, i);
  });
  const children = nodes.map(() => [] as number[]),
    roots: number[] = [];
  let missingParents = 0;
  nodes.forEach((node, i) => {
    const parent =
      node.parent_id === null ? undefined : byId.get(node.parent_id);
    if (parent === undefined) {
      roots.push(i);
      if (node.parent_id !== null) missingParents++;
    } else children[parent]!.push(i);
  });
  const order = [...roots],
    inForm = nodes.map(() => false);
  for (let i = 0; i < order.length; i++) {
    const index = order[i]!;
    for (const child of children[index]!) {
      inForm[child] = inForm[index]! || roleOf(nodes[index]!) === "form";
      order.push(child);
    }
  }
  if (order.length !== nodes.length)
    throw new Error("Cyclic accessibility ancestry cannot be reconstructed");
  return { nodes, byId, children, roots, order, inForm, missingParents };
}
type Tree = ReturnType<typeof buildTree>;

function labelParts(tree: Tree, index: number) {
  const pending = [...tree.children[index]!],
    texts: number[] = [],
    controls: number[] = [];
  for (let n = 0; n < pending.length; n++) {
    const child = pending[n]!,
      role = roleOf(tree.nodes[child]!);
    if (role === "statictext") texts.push(child);
    if (inputRoles.has(role)) controls.push(child);
    if (role !== "statictext")
      for (const next of tree.children[child]!) pending.push(next);
  }
  if (!controls.length) {
    const parent = tree.byId.get(tree.nodes[index]!.parent_id ?? "");
    for (const sibling of parent === undefined
      ? tree.roots
      : tree.children[parent]!)
      if (inputRoles.has(roleOf(tree.nodes[sibling]!))) controls.push(sibling);
  }
  return { texts, controls };
}

/** Input accessible names already include native label text; avoid rendering it twice. */
function suppressLabels(tree: Tree) {
  const suppressed = new Set<number>();
  const normalize = (text: string) => text.trim().replace(/\s+/g, " ");
  for (const index of tree.order) {
    if (roleOf(tree.nodes[index]!) !== "labeltext") continue;
    const { texts, controls } = labelParts(tree, index);
    const label = normalize(
      texts.map((t) => tree.nodes[t]!.name ?? "").join(" "),
    );
    if (
      label &&
      controls.some((c) => normalize(tree.nodes[c]!.name ?? "") === label)
    )
      for (const text of texts) suppressed.add(text);
  }
  return suppressed;
}

function context(
  tree: Tree,
  index: number,
  rendered: string[],
  primaryNav: number | undefined,
) {
  const node = tree.nodes[index]!,
    role = roleOf(node);
  const name = escapeHtml(node.name ?? ""),
    content = tree.children[index]!.map((c) => rendered[c]).join("");
  const key = `ax-${index}`;
  const state = (name: string) =>
    node.states.find((s) => s.name === name)?.value;
  return {
    tree,
    index,
    node,
    role,
    name,
    content,
    key,
    state,
    label: name || "Unlabeled control",
    disabled: state("disabled") === true ? " disabled" : "",
    primaryNav: index === primaryNav,
    wrap: (tag: string, attributes = "", body = content || name) =>
      `<${tag} id="${key}"${attributes}>${body}</${tag}>`,
  };
}
type Context = ReturnType<typeof context>;
type Rendered = { html: string; control?: boolean; unresolved?: string };

function textInput(c: Context): Rendered {
  return {
    control: true,
    html: `<label for="${c.key}">${c.label}</label><input id="${c.key}" type="${c.role === "searchbox" ? "search" : "text"}"${c.disabled}${c.state("required") === true ? " required" : ""}${c.state("readonly") === true ? " readonly" : ""}>`,
  };
}
function checkedInput(c: Context): Rendered {
  const checked = c.state("checked"),
    group = c.tree.byId.get(c.node.parent_id ?? "") ?? "root";
  return {
    control: true,
    html: `<label class="check"><input id="${c.key}" type="${c.role === "radio" ? "radio" : "checkbox"}" name="group-${group}"${checked === true || checked === "true" ? " checked" : ""}${checked === "mixed" ? ' aria-checked="mixed"' : ""}${c.role === "switch" ? ' role="switch"' : ""}${c.disabled}>${c.label}</label>`,
  };
}
function button(c: Context): Rendered {
  const pressed = c.state("pressed"),
    submit = c.tree.inForm[c.index] && pressed === undefined;
  const attributes = ` type="${submit ? "submit" : "button"}"${submit ? "" : " data-preview-action"}${c.disabled}${typeof pressed === "boolean" ? ` aria-pressed="${pressed}"` : ""}`;
  return {
    control: true,
    html: c.wrap("button", attributes, c.name || c.content || "Action"),
    unresolved:
      "Original action or panel relationship is not present in the capture",
  };
}
function select(c: Context): Rendered {
  const choices = c.tree.children[c.index]!.map((i) => c.tree.nodes[i]!).filter(
    (n) => roleOf(n) === "option",
  );
  const options = choices
    .map((n) => `<option>${escapeHtml(n.name ?? "")}</option>`)
    .join("");
  return {
    control: true,
    html: `<label for="${c.key}">${c.label}</label><select id="${c.key}"${c.disabled}>${options || '<option value="">Select</option>'}</select>`,
    ...(!choices.length
      ? { unresolved: "Option choices were not captured" }
      : {}),
  };
}
function heading(c: Context): Rendered {
  const level = c.state("level");
  return {
    html: c.wrap(
      `h${typeof level === "number" ? Math.min(6, Math.max(1, Math.floor(level))) : 2}`,
      "",
      c.name || c.content,
    ),
  };
}
const tags: { [role: string]: string } = {
  main: "main",
  navigation: "nav",
  banner: "header",
  contentinfo: "footer",
  complementary: "aside",
  region: "section",
  article: "article",
  form: "form",
  list: "ul",
  listitem: "li",
  table: "table",
  rowgroup: "tbody",
  row: "tr",
  cell: "td",
  gridcell: "td",
  columnheader: "th",
  rowheader: "th",
  paragraph: "p",
  statictext: "span",
  status: "p",
  option: "span",
  labeltext: "div",
};
function container(c: Context): Rendered {
  let attributes = c.role === "status" ? ' role="status"' : "";
  if (c.primaryNav) attributes += ' class="primary-nav"';
  if (
    ["navigation", "region", "form", "complementary"].includes(c.role) &&
    c.name
  )
    attributes += ` aria-label="${c.name}"`;
  return {
    html: c.wrap(
      tags[c.role] ?? "div",
      attributes,
      c.role === "statictext" ? c.name : c.content || c.name,
    ),
    ...(!tags[c.role]
      ? { unresolved: "Role rendered as a generic container" }
      : {}),
  };
}
const renderers: { [role: string]: (c: Context) => Rendered } = {
  textbox: textInput,
  searchbox: textInput,
  checkbox: checkedInput,
  radio: checkedInput,
  switch: checkedInput,
  button,
  tab: button,
  combobox: select,
  listbox: select,
  heading,
  link: (c) => ({
    html: c.wrap(
      "a",
      ' href="#preview-status" data-preview-link',
      c.name || c.content || "Link",
    ),
    unresolved: "No verified destination mapping from AX node to DOM URL",
  }),
  image: (c) => ({
    html: c.wrap(
      "div",
      ` class="image-placeholder" role="img" aria-label="${c.label}"`,
      `Image: ${c.label}`,
    ),
    unresolved: "Image bytes are not part of the accessible text capture",
  }),
};
renderers.img = renderers.image!;

export function renderAccessibility(nodes: AxNode[]) {
  const tree = buildTree(nodes),
    suppressed = suppressLabels(tree);
  const rendered = nodes.map(() => ""),
    unresolved: { node_id: string; role: string; reason: string }[] = [];
  const primaryNav = tree.order.find(
    (i) => !nodes[i]!.ignored && roleOf(nodes[i]!) === "navigation",
  );
  let components = 0,
    controls = 0;
  for (const index of [...tree.order].reverse()) {
    if (suppressed.has(index)) continue;
    const c = context(tree, index, rendered, primaryNav);
    if (c.node.ignored || flattenedRoles.has(c.role)) {
      rendered[index] =
        c.content ||
        (c.role === "generic" && c.name ? c.wrap("p", "", c.name) : "");
      continue;
    }
    const result = (renderers[c.role] ?? container)(c);
    components++;
    if (result.control) controls++;
    rendered[index] = result.html;
    if (result.unresolved)
      unresolved.push({
        node_id: c.node.node_id,
        role: c.role,
        reason: result.unresolved,
      });
  }
  if (!components)
    throw new Error(
      "No reconstructable content remains after accessibility projection",
    );
  return {
    html: tree.roots.map((i) => rendered[i]).join(""),
    components,
    controls,
    unresolved,
    missingParents: tree.missingParents,
  };
}
