import { watch } from "vue";
import type { Connection, Edge, GraphEdge, GraphNode, useVueFlow } from "@vue-flow/core";
import { isTypeCompatible, validateConnection, type NodeHandle } from "@toonflow/nodes-scaffold/connection";
import { getSelectionTree } from "./selectionNodes";

type Flow = ReturnType<typeof useVueFlow>;
type EdgeLike = Pick<Edge, "id" | "source" | "target" | "sourceHandle" | "targetHandle" | "data">;

export const groupOutputHandle = "groupOut";
const derivedPrefix = "groupInput:";

function nodeHandles(node: GraphNode | undefined): NodeHandle[] {
  return Array.isArray(node?.data?.handles) ? node.data.handles : [];
}

function connectionKey(connection: Pick<Connection, "source" | "target" | "sourceHandle" | "targetHandle">) {
  return JSON.stringify([connection.source, connection.sourceHandle ?? null, connection.target, connection.targetHandle ?? null]);
}

/** 分组展开出的隐藏成员连线；按 id 前缀或 data 标记识别，粘贴副本也会被重新整理。 */
export function isGroupInputEdge(edge: EdgeLike) {
  return edge.id.startsWith(derivedPrefix) || typeof edge.data?.groupInput === "string";
}

function isGroupOutputEdge(edge: EdgeLike, nodes: Map<string, GraphNode> | GraphNode[]) {
  if (edge.sourceHandle !== groupOutputHandle) return false;
  const source = Array.isArray(nodes) ? nodes.find(node => node.id === edge.source) : nodes.get(edge.source);
  return source?.type === "canvasGroup";
}

export function getGroupMembers(group: GraphNode, nodes: GraphNode[]) {
  return getSelectionTree([group], nodes).filter(node => node.type !== "canvasGroup");
}

/** 计算分组整体连到目标端口时需要新增的成员连线；任一兼容成员被目标规则拒绝时返回 undefined。 */
export function getGroupConnections(group: GraphNode, target: GraphNode, targetHandleId: string, nodes: GraphNode[], edges: GraphEdge[]) {
  if (group.type !== "canvasGroup" || target.type === "canvasGroup" || target.connectable === false) return;
  const members = getGroupMembers(group, nodes);
  if (members.some(member => member.id === target.id)) return;
  const targetHandle = nodeHandles(target).find(handle => handle.type === "target" && handle.id === targetHandleId);
  if (!targetHandle) return;
  const existing = new Set(edges.map(connectionKey));
  const pendingEdges = [...edges];
  const connections: Connection[] = [];
  let compatible = 0;
  for (const member of members) {
    if (member.connectable === false) continue;
    for (const handle of nodeHandles(member)) {
      if (handle.type !== "source" || !isTypeCompatible(handle.dataType, targetHandle.dataType)) continue;
      compatible++;
      const connection = { source: member.id, sourceHandle: handle.id, target: target.id, targetHandle: targetHandle.id };
      if (existing.has(connectionKey(connection))) continue;
      if (!validateConnection(connection, { sourceNode: member, targetNode: target, nodes, edges: pendingEdges })) return;
      connections.push(connection);
      existing.add(connectionKey(connection));
      // ACT: 候选边只参与本次校验，让目标的数量限制按整组累计。
      pendingEdges.push({
        ...connection, id: crypto.randomUUID(), type: "default", selected: false, data: {}, events: {},
        sourceNode: member, targetNode: target,
        sourceX: member.computedPosition.x, sourceY: member.computedPosition.y,
        targetX: target.computedPosition.x, targetY: target.computedPosition.y,
      });
    }
  }
  return compatible ? connections : undefined;
}

function desiredEdges(nodes: GraphNode[], edges: GraphEdge[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const used = new Set(edges.filter(edge => !isGroupInputEdge(edge)).map(connectionKey));
  const desired = new Map<string, Edge>();
  for (const edge of edges) {
    if (!isGroupOutputEdge(edge, byId) || !edge.targetHandle) continue;
    const target = byId.get(edge.target);
    const targetHandle = nodeHandles(target).find(handle => handle.type === "target" && handle.id === edge.targetHandle);
    if (!target || !targetHandle) continue;
    for (const member of getGroupMembers(byId.get(edge.source)!, nodes)) {
      if (member.id === target.id) continue;
      for (const handle of nodeHandles(member)) {
        if (handle.type !== "source" || !isTypeCompatible(handle.dataType, targetHandle.dataType)) continue;
        const connection = { source: member.id, sourceHandle: handle.id, target: target.id, targetHandle: targetHandle.id };
        const key = connectionKey(connection);
        if (used.has(key)) continue;
        used.add(key);
        const id = `${derivedPrefix}${edge.id}:${member.id}:${handle.id}`;
        desired.set(id, { id, ...connection, hidden: true, selectable: false, focusable: false, data: { groupInput: edge.id } });
      }
    }
  }
  return desired;
}

/**
 * 分组输出端口连到节点后，在画布宿主侧把组内成员展开为隐藏连线，节点沿用原有输入读取路径。
 * ACT: 展开连线随画布保存，旧版本客户端打开时仍能读到参考；同步时只按端口类型匹配，目标的附加规则在连线时校验。
 * 在目标节点里单独移除某个组成员的参考会被重新展开，需要排除成员时删除分组连线或把成员移出分组。
 */
export function useGroupInputs(flow: Flow) {
  watch(
    () => {
      const desired = desiredEdges(flow.getNodes.value, flow.getEdges.value);
      const current = flow.getEdges.value.filter(isGroupInputEdge);
      return JSON.stringify([
        [...desired.values()].map(edge => [edge.id, connectionKey(edge)]),
        current.map(edge => [edge.id, connectionKey(edge)]),
      ]);
    },
    () => {
      const desired = desiredEdges(flow.getNodes.value, flow.getEdges.value);
      const current = flow.getEdges.value.filter(isGroupInputEdge);
      const stale = current.filter(edge => desired.get(edge.id) === undefined || connectionKey(desired.get(edge.id)!) !== connectionKey(edge));
      const kept = new Set(current.filter(edge => !stale.includes(edge)).map(edge => edge.id));
      if (stale.length) flow.removeEdges(stale);
      const added = [...desired.values()].filter(edge => !kept.has(edge.id));
      if (added.length) flow.addEdges(added);
    },
    { immediate: true },
  );
}
