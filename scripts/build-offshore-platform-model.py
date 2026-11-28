"""Build the fleet set's offshore platform model in Blender and export it as GLB.

Run headless with Blender 5.3, from the repository root:
    blender -b --python scripts/build-offshore-platform-model.py -- [out_dir]
out_dir defaults to offshore-platform-model/ under the system's temporary
directory. Pack offshore_platform.glb from there like the rest of the set
(KHR_mesh_quantization and EXT_meshopt_compression; quantize first, as a
quantize after meshopt decodes the compression again), then copy it to
public/models/fleet/other/ and update its catalog.json entry and the trail
anchor table (scripts/measure-fleet-trail-anchors.mjs):
    npx --yes @gltf-transform/cli@4.5.1 quantize offshore_platform.glb quantized.glb
    npx --yes @gltf-transform/cli@4.5.1 meshopt quantized.glb offshore_platform.glb

A low-poly steel jacket platform: four tapering legs with X-bracing on each
face at two levels, a deck, one module box with a safety-yellow trim, and a
pedestal crane. Every dimension is in metres, in the *scene frame of the
exported glTF*: +Y up, origin at the waterline, centred on the jacket. The
legs reach 20 m below the waterline, where the layer's waterline clip hides
them. Blender is Z-up; the exporter (export_yup=True) maps Blender +Z to glTF
+Y and Blender +Y to glTF -Z, so the helper B() builds a glTF point (x, y, z)
at Blender (x, -z, y), and nothing else here thinks in Blender axes.

Everything is made from Blender primitives; nothing is imported. Colour is per
vertex (COLOR_0), with one untextured material, like the rest of the fleet set.
"""
import json
import math
import os
import sys
import tempfile

import bpy
from mathutils import Vector

_ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
HERE = os.path.abspath(_ARGS[0]) if _ARGS else os.path.join(tempfile.gettempdir(), "offshore-platform-model")
os.makedirs(HERE, exist_ok=True)
NAME = "offshore_platform"
GLB = os.path.join(HERE, NAME + ".glb")
STATS_JSON = os.path.join(HERE, "build_stats.json")


def log(*a):
    print("[offshore_platform]", *a)
    sys.stdout.flush()


# --------------------------------------------------------------------------------------- frame helpers
def B(v):
    """glTF scene coords (x, y up, z) -> Blender coords (Z-up)."""
    return Vector((v[0], -v[2], v[1]))


def Bsize(s):
    """Box dimensions glTF (sx, sy, sz) -> Blender (sx, sz, sy)."""
    return (abs(s[0]), abs(s[2]), abs(s[1]))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def colour(hex_rgb):
    """'#rrggbb' -> linear RGBA, as glTF COLOR_0 holds it."""
    h = hex_rgb.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


# The fleet set's flat greys and safety yellow.
COLOURS = {
    "LEG": colour("#8a8f94"),
    "DECK": colour("#b9bec2"),
    "BRACE": colour("#3a3f44"),
    "YELLOW": colour("#e8c200"),
}

# --------------------------------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
PARTS = []


def _apply_rot_scale(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def _paint(obj, key):
    """Give every face corner of `obj` the colour `key`, in the shared attribute."""
    mesh = obj.data
    attr = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    rgba = COLOURS[key]
    for item in attr.data:
        item.color = rgba
    mesh.color_attributes.active_color = attr
    PARTS.append(obj)
    return obj


def _rot_for(direction):
    """Euler that turns Blender +Z onto the Blender image of a glTF direction."""
    d = B(direction).normalized()
    return Vector((0, 0, 1)).rotation_difference(d).to_euler()


def box(center, size, key):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=B(center))
    o = bpy.context.active_object
    o.scale = Bsize(size)
    _apply_rot_scale(o)
    return _paint(o, key)


def strut(start, end, r1, r2, key, segs):
    """A frustum from radius r1 at glTF point `start` to r2 at `end`."""
    a, b = Vector(start), Vector(end)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=segs, radius1=r1, radius2=r2, depth=d.length,
                                    location=B((a + b) / 2), rotation=_rot_for(d))
    o = bpy.context.active_object
    _apply_rot_scale(o)
    return _paint(o, key)


def beam(start, end, width, key):
    """A square-section member from glTF point `start` to `end`."""
    a, b = Vector(start), Vector(end)
    d = b - a
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=B((a + b) / 2), rotation=_rot_for(d))
    o = bpy.context.active_object
    o.scale = (width, width, d.length)
    _apply_rot_scale(o)
    return _paint(o, key)


# ======================================================================================= GEOMETRY
LEG_BOTTOM_Y = -20.0
DECK_Y = 22.0            # underside of the deck, top of the legs
DECK_TOP_Y = 25.0
LEG_TOP = 24.0           # leg centre offset in x and z at the deck
LEG_BOTTOM = 27.5        # ... and at the mudline: the legs taper inward going up
LEG_R_TOP = 1.5          # 3 m wide at the top
LEG_R_BOTTOM = 1.9


def leg_at(y, sx, sz):
    """The centre of the (sx, sz) leg at height y."""
    t = (y - LEG_BOTTOM_Y) / (DECK_Y - LEG_BOTTOM_Y)
    off = LEG_BOTTOM + (LEG_TOP - LEG_BOTTOM) * t
    return Vector((sx * off, y, sz * off))


CORNERS = [(-1, -1), (1, -1), (1, 1), (-1, 1)]

# Jacket legs.
for sx, sz in CORNERS:
    strut(leg_at(LEG_BOTTOM_Y, sx, sz), leg_at(DECK_Y, sx, sz), LEG_R_BOTTOM, LEG_R_TOP, "LEG", 16)

# X-bracing on each face at two levels above the waterline, with horizontals.
LEVELS = [1.0, 11.5, DECK_Y - 1.0]
for i in range(4):
    (ax, az), (bx, bz) = CORNERS[i], CORNERS[(i + 1) % 4]
    for y0, y1 in zip(LEVELS, LEVELS[1:]):
        strut(leg_at(y0, ax, az), leg_at(y1, bx, bz), 0.45, 0.45, "BRACE", 8)
        strut(leg_at(y0, bx, bz), leg_at(y1, ax, az), 0.45, 0.45, "BRACE", 8)
    for y in LEVELS[:-1]:
        strut(leg_at(y, ax, az), leg_at(y, bx, bz), 0.5, 0.5, "BRACE", 8)

# Deck: 56 x 56 x 3 m.
box((0, (DECK_Y + DECK_TOP_Y) / 2, 0), (56, DECK_TOP_Y - DECK_Y, 56), "DECK")

# Module: 20 m long, 10 m deep, 14 m tall, with a yellow trim band at its roof.
MODULE_C = (-9.0, DECK_TOP_Y + 7.0, -8.0)
box(MODULE_C, (20, 14, 10), "DECK")
box((MODULE_C[0], DECK_TOP_Y + 13.0, MODULE_C[2]), (20.6, 1.2, 10.6), "YELLOW")

# Crane: a pedestal at the deck's +x, +z corner and a 30 m boom at 35 degrees,
# reaching out over the side.
PED = Vector((20.0, DECK_TOP_Y, 20.0))
strut(PED, PED + Vector((0, 7.0, 0)), 1.4, 1.2, "YELLOW", 12)
box((PED.x, PED.y + 8.0, PED.z), (3.6, 2.4, 3.6), "YELLOW")
heading = Vector((1.0, 0.0, 1.0)).normalized()
boom_root = PED + Vector((0, 8.0, 0))
boom_tip = boom_root + heading * (30.0 * math.cos(math.radians(35))) + Vector((0, 30.0 * math.sin(math.radians(35)), 0))
beam(boom_root, boom_tip, 1.1, "YELLOW")

# ======================================================================================= JOIN, MATERIAL
bpy.ops.object.select_all(action="DESELECT")
for p in PARTS:
    p.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]
bpy.ops.object.join()
obj = bpy.context.active_object
obj.name = NAME
obj.data.name = NAME
bpy.ops.object.shade_flat()
scene.cursor.location = (0, 0, 0)
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")

mat = bpy.data.materials.new(NAME + "_mat")
if mat.node_tree is None:
    mat.use_nodes = True
mat.use_backface_culling = False
nodes = mat.node_tree.nodes
bsdf = nodes.get("Principled BSDF")
bsdf.inputs["Metallic"].default_value = 0.0
bsdf.inputs["Roughness"].default_value = 0.65
vc = nodes.new("ShaderNodeVertexColor")
vc.layer_name = "Col"
mat.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
obj.data.materials.clear()
obj.data.materials.append(mat)

obj.data.calc_loop_triangles()
tris = len(obj.data.loop_triangles)
axes = list(zip(*[(v.co.x, v.co.z, -v.co.y) for v in obj.data.vertices]))  # Blender -> glTF
lo = [min(a) for a in axes]
hi = [max(a) for a in axes]
log("triangles:", tris, "glTF bounds:", [round(c, 3) for c in lo], [round(c, 3) for c in hi])

# ======================================================================================= EXPORT
export_kwargs = dict(
    filepath=GLB,
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_animations=False,
    export_skins=False,
    export_cameras=False,
    export_lights=False,
    export_materials="EXPORT",
    export_normals=True,
    export_tangents=False,
    export_texcoords=False,
    export_vertex_color="ACTIVE",
    export_all_vertex_colors=False,
    use_selection=False,
    export_draco_mesh_compression_enable=False,
)
try:
    bpy.ops.export_scene.gltf(**export_kwargs)
except TypeError as e:
    log("export kwargs rejected, retrying without the unknown ones:", e)
    props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    bpy.ops.export_scene.gltf(**{k: v for k, v in export_kwargs.items() if k in props})

with open(STATS_JSON, "w") as fh:
    json.dump({"triangles": tris, "min": lo, "max": hi}, fh, indent=2)
log("wrote", GLB)
