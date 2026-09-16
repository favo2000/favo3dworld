// Synthetic tetrahedron; contains no production model or private source data.
function fixture(extra = {}) {
  const positions = new Float32Array([0,1,0,-1,-1,1,1,-1,1,0,-1,-1]);
  const indices = new Uint16Array([0,1,2,0,2,3,0,3,1,1,3,2]);
  const bin = Buffer.concat([Buffer.from(positions.buffer),Buffer.from(indices.buffer)]);
  const model = {asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],
    materials:[{doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[0.05,0.6,0.5,1],metallicFactor:0,roughnessFactor:0.8}}],
    buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength},{buffer:0,byteOffset:positions.byteLength,byteLength:indices.byteLength}],
    accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[-1,-1,-1],max:[1,1,1]},{bufferView:1,componentType:5123,count:12,type:'SCALAR'}],...extra};
  const str=JSON.stringify(model),json=Buffer.from(str+' '.repeat((4-Buffer.byteLength(str)%4)%4));
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const chunk=Buffer.alloc(8);chunk.writeUInt32LE(bin.length,0);chunk.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,json,chunk,bin]);
}
module.exports=fixture;
if(require.main===module)require('node:fs').writeFileSync(process.argv[2],fixture());
