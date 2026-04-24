export type FlowChartNodeKind = "event" | "flow" | "compute" | string;
export type FlowChartPortDirection = "input" | "output";

export type FlowChartTypeRef =
  | {
      kind: "builtin";
      name: string;
    }
  | {
      kind: "custom";
      name: string;
      fullName?: string;
    }
  | {
      kind: "list";
      elementType: FlowChartTypeRef;
    }
  | {
      kind: "dictionary";
      keyType: FlowChartTypeRef;
      valueType: FlowChartTypeRef;
    }
  | Record<string, unknown>;

export type FlowChartPropertyDefinition = {
  propertyId: number;
  name: string;
  alias?: string | null;
  type: FlowChartTypeRef;
  defaultValue?: unknown;
};

export type FlowChartComputePortDefinition = {
  portId: number;
  name: string;
  alias?: string | null;
  direction: FlowChartPortDirection;
  type: FlowChartTypeRef;
};

export type FlowChartFlowPortDefinition = {
  portId: number;
  name: string;
  alias?: string | null;
  direction: FlowChartPortDirection;
};

export type FlowChartNodeDefinitionDocument = {
  formatVersion: string;
  name: string;
  alias?: string | null;
  nodeKind: FlowChartNodeKind;
  properties: FlowChartPropertyDefinition[];
  computePorts: FlowChartComputePortDefinition[];
  flowPorts: FlowChartFlowPortDefinition[];
};

export type FlowChartNodeDefinitionSummary = {
  kind: "flowchart-node";
  relativePath: string;
  filePath: string;
  name: string;
  alias?: string | null;
  nodeKind: FlowChartNodeKind;
};

export type FlowChartNodeDefinitionResponse = FlowChartNodeDefinitionSummary & {
  document: FlowChartNodeDefinitionDocument | null;
};

export type FlowChartNodePropertyValue = {
  propertyId: number;
  value: unknown;
};

export type FlowChartNodeInstance = {
  nodeId: number;
  nodeType: string;
  layout: {
    x: number;
    y: number;
  };
  propertyValues: FlowChartNodePropertyValue[];
};

export type FlowChartConnection = {
  sourceNodeId: number;
  sourcePortId: number;
  targetNodeId: number;
  targetPortId: number;
};

export type FlowChartConnectionKind = "flow" | "compute";

export type FlowChartFileDocument = {
  formatVersion: string;
  name: string;
  alias?: string | null;
  nodes: FlowChartNodeInstance[];
  flowConnections: FlowChartConnection[];
  computeConnections: FlowChartConnection[];
};

export type FlowChartFileSummary = {
  kind: "flowchart-file";
  relativePath: string;
  filePath: string;
  name: string;
  alias?: string | null;
};

export type FlowChartFileResponse = FlowChartFileSummary & {
  document: FlowChartFileDocument | null;
};

export type FlowChartCodegenExportResponse = {
  relativePath?: string;
  relativePaths?: string[];
  outputDirectoryPath: string;
  fileCount: number;
  files: string[];
  flowChartCount?: number;
};

export type FlowChartCatalogResponse = {
  flowChartsRootPath: string;
  flowChartNodesRootPath: string;
  flowChartFilesRootPath: string;
  nodeDirectories: string[];
  fileDirectories: string[];
  nodeDefinitions: FlowChartNodeDefinitionSummary[];
  files: FlowChartFileSummary[];
};

export type FlowChartSelectionFocus =
  | {
      kind: "node";
      nodeId: number;
    }
  | {
      kind: FlowChartConnectionKind;
      connectionKey: string;
    }
  | null;

export type FlowChartSelection = {
  nodeIds: number[];
  flowConnectionKeys: string[];
  computeConnectionKeys: string[];
  focus: FlowChartSelectionFocus;
};

export type FlowChartClipboardSnapshot = {
  nodes: FlowChartNodeInstance[];
  flowConnections: FlowChartConnection[];
  computeConnections: FlowChartConnection[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
};

export type PendingFlowChartConnection = {
  kind: FlowChartConnectionKind;
  sourceNodeId: number;
  sourcePortId: number;
};

export type FlowChartValidationIssue = {
  id: string;
  severity: "error";
  message: string;
};

export type FlowChartPortDescriptor = {
  kind: FlowChartConnectionKind;
  direction: FlowChartPortDirection;
  portId: number;
  name: string;
  alias?: string | null;
  type?: FlowChartTypeRef;
};