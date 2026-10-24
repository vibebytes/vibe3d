export const HELP = `vibe3d — 专家级 3D 场景 CLI（与 MCP / HTTP 同一套能力）

用法：vibe3d <group> <command> [args] [--flags]

  status                        daemon 健康与能力清单
  room new [--name n] [--template empty|showroom|product]
  room ls | room use <roomId> | room show <roomId> | room rm <roomId> [--purge]
  scene get|summary|undo|redo|diff <roomId>
  scene undo <roomId> [--op-id id]
  scene apply <roomId> --ops <json|@file> [--dry-run]
  scene export <roomId> [--out scene.json]
  scene import <roomId> <file.json> [--expect-revision n]
  scene checkpoint <roomId> [--name n] | scene checkpoints <roomId> | scene restore <roomId> <checkpointId>
  node create <roomId> --kind mesh|group|light [--shape box|sphere|cylinder|plane]
  node update <roomId> <nodeId> --patch <json|@file>
  node rm <roomId> <nodeId> [--no-cascade]
  node clone <roomId> <nodeId> [--count 2] [--parent <id>] [--transform <json>]
  stage set <roomId> --preset <name> | --stage <json|@file>   # npr / post 走 --stage
  anim play <roomId> <nodeId> [--clip n] [--speed 1]
  camera set <roomId> [--frame fit|close|wide] [--preset miniature_45] [--name hero] [--p x,y,z] [--target x,y,z]
  camera save <roomId> --name <hero> | camera rm <roomId> <hero>
  render snapshot <roomId> [--out shot.png] [--size 1280x720] [--format png|jpeg] [--settle-ms 180] [--at 1.2] [--transparent] [--shading flat|wireframe|normals] [--overlay grid,axes,bbox]
  render views <roomId> [--views three_quarter,front,top] [--node id1,id2] [--out dir/] [--size 1280x720] [--format png|jpeg] [--shading flat|wireframe|normals] [--overlay grid,axes,bbox]
  render node <roomId> <nodeId> [--view three_quarter] [--padding 1.2] [--out shot.png] [--size 1280x720] [--format png|jpeg] [--shading flat|wireframe|normals] [--overlay grid,axes,bbox]
  render pick <roomId> [--points 10,10;20,20] [--rect x,y,w,h] [--top-colors 5] [--size 1280x720] [--shading flat|wireframe|normals] [--overlay grid,axes,bbox]
  ↳ --shading flat 纯色去光照 / wireframe 线框看穿模 / normals 法线查朝向；--overlay 可逗号多选（grid 地面网格、axes 原点轴、bbox 包围盒），只影响本次出图，渲染后自动还原
  export glb <roomId> [--node id] [--out scene.glb] [--timeout 600] [--no-wait]
  job get <jobId> | job wait <jobId> [--timeout 600] | job cancel <jobId>
  job ls [roomId]
  open <roomId> [--focus nodeId] [--no-reuse]
  model import <roomId> <src> [--name n] [--autoplay]
  asset inspect <roomId> <src> | asset put <roomId> <src> [--kind auto|image|hdri|model] [--name n]
  env set <roomId> [--hdri <src>] [--policy local|allow|strict] [--fog near,far]
  decal create <roomId> (--text 文字 | --image-sha <sha>) [--at x,y,z] [--width 2] [--height 1] [--rotation rx,ry,rz] [--color #rrggbb] [--background #rrggbbaa] [--font-size 64] [--bold] [--align left|center|right] [--parent <id>]
  mesh boolean <roomId> <target> <tool> [--op subtract|union|intersect] [--keep-tool]
  asset ls <roomId> | asset rm <roomId> <sha>
  call <method> [--params <json|@file>] [--room <roomId>]
  daemon [--port 0] [--persist]   （前台运行 daemon）

全局：--home <dir> --url <http://127.0.0.1:port> --token <t> --pretty
`;
