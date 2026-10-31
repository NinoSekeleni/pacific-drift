// A paperback puzzle book with a pencil tucked on top: navy card cover, cream page block, a gold
// band and a grid printed on the cover. Built in code, about 17 × 24 cm.
import * as THREE from 'three';

export function createPuzzleBookModel(){
 const root=new THREE.Group();root.name='puzzles';
 const W=.17,T=.022,D=.24;
 const cover=new THREE.MeshStandardMaterial({color:0x1d2c4a,roughness:.7,name:'Puzzle book cover'});
 const pages=new THREE.MeshStandardMaterial({color:0xe9e1cc,roughness:.92,name:'Puzzle book pages'});
 // box faces: +x, -x (spine), +y (front cover), -y, +z, -z
 const book=new THREE.Mesh(new THREE.BoxGeometry(W,T,D),[pages,cover,cover,cover,pages,pages]);book.position.y=T/2;root.add(book);
 const gold=new THREE.MeshStandardMaterial({color:0xc39a3a,roughness:.45,metalness:.6,name:'Puzzle book foil'});
 const band=new THREE.Mesh(new THREE.BoxGeometry(W*.98,.0008,.018),gold);band.position.set(0,T+.0004,-D*.3);root.add(band);
 // a small printed crossword on the cover
 const ink=new THREE.MeshStandardMaterial({color:0xf2ead6,roughness:.8,name:'Puzzle book print'});
 const cells=[[0,0],[1,0],[2,0],[3,0],[1,1],[1,2],[0,2],[2,2],[3,2],[3,1],[3,3],[1,3]];
 for(const [i,j]of cells){const c=new THREE.Mesh(new THREE.BoxGeometry(.017,.0008,.017),ink);c.position.set(-.03+i*.02,T+.0004,.0+j*.02);root.add(c);}
 // pencil lying across the cover
 const wood=new THREE.MeshStandardMaterial({color:0xd8a33a,roughness:.6,name:'Pencil'});
 const pencil=new THREE.Mesh(new THREE.CylinderGeometry(.0035,.0035,.15,6),wood);pencil.rotation.set(0,0,Math.PI/2);pencil.rotation.y=.5;pencil.position.set(0,T+.0035,.08);root.add(pencil);
 const tip=new THREE.Mesh(new THREE.ConeGeometry(.0035,.012,6),new THREE.MeshStandardMaterial({color:0x2a2622,roughness:.6}));
 tip.position.set(.075,0,0);tip.rotation.z=-Math.PI/2;pencil.add(tip);tip.position.set(0,.081,0);tip.rotation.set(0,0,0);
 return root;
}
