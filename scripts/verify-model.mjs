import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import protobuf from 'protobufjs';
const schema = protobuf.parse(`syntax="proto3";
message Dim { int64 dim_value=1; string dim_param=2; } message Shape { repeated Dim dim=1; }
message TensorType { int32 elem_type=1; Shape shape=2; } message Type { TensorType tensor_type=1; }
message Value { string name=1; Type type=2; } message Node { string op_type=4; }
message Graph { repeated Node node=1; repeated Value input=11; repeated Value output=12; }
message Opset { int64 version=2; } message Model { Graph graph=7; repeated Opset opset_import=8; }`).root.lookupType('Model');
for (const directory of ['liveaction-span-x2', 'ffdnet-color']) {
    const root = new URL(`../public/models/${directory}/`, import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('model.json', root)));
    const bytes = readFileSync(new URL(manifest.file, root));
    const limit = 20000000;
    if (bytes.length !== manifest.bytes || bytes.length > limit || createHash('sha256').update(bytes).digest('hex') !== manifest.sha256 || statSync(new URL('LICENSE', root)).size < 1000 || !['Apache-2.0', 'MIT'].includes(manifest.license)) throw new Error(`Model asset integrity check failed: ${directory}`);
    if (!readFileSync(new URL('../src/enhancement/local/modelManifest.ts', import.meta.url), 'utf8').includes(manifest.sha256)) throw new Error('Trusted app manifest does not match model');
    const { graph } = schema.decode(bytes);
    if (graph.input.length !== 1 || graph.output.length !== 1 || graph.input[0].name !== 'input' || graph.output[0].name !== 'output') throw new Error('Invalid ONNX I/O');
    const dimensions = graph.input[0].type.tensorType.shape.dim;
    if (Number(dimensions[1].dimValue) !== 3 || !dimensions[2].dimParam || !dimensions[3].dimParam) throw new Error('Invalid input layout or static spatial dimensions');
    const operators = [...new Set(graph.node.map(n => n.opType))].sort();
    if (manifest.operators && operators.join() !== manifest.operators.join()) throw new Error('ONNX operators do not match manifest');
    console.log(`PASS ${manifest.id}: ${manifest.bytes} bytes, ${manifest.parameters} parameters, SHA-256/I/O/graph verified (${operators.join(', ')})`);
}
