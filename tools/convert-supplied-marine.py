import bpy,sys,pathlib,math
args=sys.argv[sys.argv.index('--')+1:];kind,path,out,texture_dir=args;texture_dir=pathlib.Path(texture_dir)
if path.endswith('.blend'):bpy.ops.wm.open_mainfile(filepath=path,load_ui=False,use_scripts=False)
else:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 if path.endswith('.fbx'):bpy.ops.import_scene.fbx(filepath=path,use_anim=True)
 else:bpy.ops.wm.obj_import(filepath=path)
if kind=='orca':
 for o in list(bpy.data.objects):
  if o.type=='MESH' and o.name not in ['BODY_LOPOLY','LEFT_EYEBALL','RIGHT_EYEBALL','TEETHHIGHER2','TEETHLOWER2','TONGUE_LOPOLY']:bpy.data.objects.remove(o,do_unlink=True)
for o in list(bpy.data.objects):
 if o.type in ['CAMERA','LIGHT']:bpy.data.objects.remove(o,do_unlink=True)
meshes=[o for o in bpy.data.objects if o.type=='MESH']
for m in {m for o in meshes for m in o.data.materials if m}:
 m.use_nodes=True;n=m.node_tree.nodes;n.clear();output=n.new('ShaderNodeOutputMaterial');bs=n.new('ShaderNodeBsdfPrincipled');m.node_tree.links.new(bs.outputs['BSDF'],output.inputs['Surface']);bs.inputs['Roughness'].default_value=.48;bs.inputs['Metallic'].default_value=0
 stem=m.name if kind=='cargo' else 'body'
 def tex(name,input_name,normal=False,bump=False):
  f=texture_dir/(stem+'-'+name+'.png')
  if not f.exists():return
  im=bpy.data.images.load(str(f),check_existing=True);t=n.new('ShaderNodeTexImage');t.image=im
  if normal or bump:
   im.colorspace_settings.name='Non-Color';node=n.new('ShaderNodeNormalMap' if normal else 'ShaderNodeBump');m.node_tree.links.new(t.outputs['Color'],node.inputs['Color' if normal else 'Height']);m.node_tree.links.new(node.outputs['Normal'],bs.inputs['Normal']);node.inputs['Strength'].default_value=.5
  else:
   if input_name!='Base Color':im.colorspace_settings.name='Non-Color'
   m.node_tree.links.new(t.outputs['Color'],bs.inputs[input_name])
 if 'eye' in m.name.lower() and kind in ['shark','dolphin']:bs.inputs['Base Color'].default_value=(.01,.017,.019,1);bs.inputs['Roughness'].default_value=.15
 else:tex('color','Base Color');tex('normal','Normal',normal=True);tex('bump','Normal',bump=True);tex('rough','Roughness');tex('metal','Metallic')
for o in meshes:
 for mod in list(o.modifiers):
  if mod.type=='SUBSURF':o.modifiers.remove(mod)
 o.hide_set(False);o.hide_render=False
scene=bpy.context.scene;actions=list(bpy.data.actions);scene.frame_start=max(0,int(min((a.frame_range[0] for a in actions),default=1)));scene.frame_end=int(max((a.frame_range[1] for a in actions),default=1));scene.frame_set(scene.frame_start)
if kind=='orca':
 parent=bpy.data.objects.new('Swimming orientation',None);scene.collection.objects.link(parent)
 for o in list(scene.objects):
  if o!=parent and o.parent is None:o.parent=parent
 parent.rotation_euler.x=math.pi/2
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_animations=bool(actions),export_animation_mode='SCENE',export_force_sampling=True,export_frame_range=True,export_skins=True,export_morph=True,export_yup=True,export_extras=False,export_cameras=False,export_lights=False)
print('EXPORTED',kind,out)
