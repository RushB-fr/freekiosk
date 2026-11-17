"""Pixel icon set for the FreeKiosk grid: one tile style, every glyph centered exactly."""
import zlib,struct,sys,os
N,SC=35,6                       # 35x35 cells, 210 px; odd grid -> exact center cell 17
INSET=2                         # tile inset 2 cells = 12 px = 5.7%
T=(0,0,0,0)
def rgb(h,a=255): return (int(h[1:3],16),int(h[3:5],16),int(h[5:7],16),a)
def save(px,fn):
    W=N*SC; rows=[]
    for Y in range(W):
        rows.append(b'\0'+b''.join(bytes(px.get((X//SC,Y//SC),T)) for X in range(W)))
    ch=lambda t,d: struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    open(fn,'wb').write(b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',W,W,8,6,0,0,0))+ch(b'IDAT',zlib.compress(b''.join(rows),9))+ch(b'IEND',b''))
def tile(fill,edge):
    px={}; a,b=INSET,N-1-INSET
    for y in range(a,b+1):
        for x in range(a,b+1):
            dx=min(x-a,b-x); dy=min(y-a,b-y)
            if dx+dy<2: continue
            px[(x,y)]=edge if dx==0 or dy==0 or dx+dy==2 else fill
    return px
def place(px,glyph):
    """Shift glyph so its bounding box sits exactly on the center cell."""
    xs=[x for x,y in glyph]; ys=[y for x,y in glyph]
    w,h=max(xs)-min(xs)+1,max(ys)-min(ys)+1
    assert (N-w)%2==0 and (N-h)%2==0, f'glyph {w}x{h} cannot center on {N}'
    ox,oy=(N-w)//2-min(xs),(N-h)//2-min(ys)
    for (x,y),c in glyph.items(): px[(x+ox,y+oy)]=c
    return px
def rect(g,x0,y0,x1,y1,c):
    for y in range(y0,y1+1):
        for x in range(x0,x1+1): g[(x,y)]=c
def disc(g,x0,y0,d,c,hi=None):   # d x d pixel circle, optional highlight
    r=d/2
    for y in range(d):
        for x in range(d):
            if (x+.5-r)**2+(y+.5-r)**2<=r*r+.3: g[(x0+x,y0+y)]=c
    if hi and d>=4: g[(x0+1,y0+1)]=hi
W=rgb('#ffffff')
icons={}
# Homeflix: play triangle 13 wide x 15 tall
g={}
for y in range(15):
    for x in range(13):
        if abs(y+.5-7.5) <= 7.5*(13-(x+.5))/13+.01: g[(x,y)]=W
icons['homeflix']=place(tile(rgb('#e50914'),rgb('#8c101c')),g)
# Netflix: red N, darker diagonal; 180-degree symmetric
g={}; R,D=rgb('#e50914'),rgb('#99060e')
rect(g,0,0,2,16,R); rect(g,10,0,12,16,R)
for y in range(17):
    x=round(y*10/16)
    rect(g,max(0,x-0),y,min(12,x+2),y,D)
rect(g,0,0,2,16,R); rect(g,10,0,12,16,R)
icons['netflix']=place(tile(rgb('#141414'),rgb('#000000')),g)
# Disney+: arc over a castle
g={}; C,A,K=W,rgb('#7fd6ff'),rgb('#0e1e5b')
castle=[
"..........#..........",
".........###.........",
"........#####........",
".........#.#.........",
"...#.....###.....#...",
"..###....###....###..",
".#####.#######.#####.",
"..#.#..#.#.#.#..#.#..",
"..###..#######..###..",
"..###.#########.###..",
"..#################..",
"..#################..",
"..#######...#######..",
"..######.....######..",
"..######.....######..",
]
for y,row in enumerate(castle):
    for x,ch in enumerate(row):
        if ch=='#': g[(x,y+7)]=C
for x in range(21):                                   # arc, 21 wide
    for y in range(10):
        d=((x-10)**2/100+(y-9.5)**2/81)
        if .80<=d<=1.0: g[(x,y)]=A
icons['disney-plus']=place(tile(rgb('#0e1e5b'),rgb('#07103a')),g)
# Spectrum Shooter: rainbow bubble rows, aim dots, launcher bubble
g={}; cols=[rgb(h) for h in ('#ff4b4b','#ff9b2f','#ffd93b','#4cd964','#3fa9ff','#9b5cff')]
for i in range(4): disc(g,i*6,0,5,cols[i],W)
for i in range(3): disc(g,3+i*6,5,5,cols[3+i] if i<2 else cols[0],W)
for y in (12,14,16): g[(11,y)]=rgb('#ffffff',200)
disc(g,9,18,5,cols[4],W)
rect(g,7,24,15,24,rgb('#c9c4f0')); rect(g,8,25,14,25,rgb('#c9c4f0')); rect(g,9,26,13,26,rgb('#c9c4f0'))
icons['spectrum-shooter']=place(tile(rgb('#2a1d5c'),rgb('#170f38')),g)
# Path Garden: spring -> winding watered path -> flower
g={}; sand,water=rgb('#e9d29a'),rgb('#3fa9ff')
segs=[((6,3),(17,3)),((17,3),(17,12)),((17,12),(5,12)),((5,12),(5,21)),((5,21),(14,21))]
for (a,b),(c,d) in segs: rect(g,min(a,c)-3,min(b,d)-3,max(a,c)+3,max(b,d)+3,sand)
for (a,b),(c,d) in segs: rect(g,min(a,c)-1,min(b,d)-1,max(a,c)+1,max(b,d)+1,water)
disc(g,0,0,7,water,W)                                  # spring
P,Y=rgb('#ff8fc7'),rgb('#ffd93b')                      # flower at path end
flower=[".PP.PP.","PPPPPPP","PPYYYPP",".PYYYP.","PPYYYPP","PPPPPPP",".PP.PP."]
for y,row in enumerate(flower):
    for x,ch in enumerate(row):
        if ch!='.': g[(14+x,18+y)]=P if ch=='P' else Y
icons['path-garden']=place(tile(rgb('#3f9b4f'),rgb('#246b33')),g)
# Arrow Me Out: dot lattice + thin bent arrows (180-degree symmetric)
g={}; dot=rgb('#c9c4b8'); L=lambda i:6*i
for i in range(5):
    for j in range(5): g[(L(i),L(j))]=dot
def arrow(pts,col):
    for (a,b),(c,d) in zip(pts,pts[1:]):
        rect(g,min(L(a),L(c)),min(L(b),L(d)),max(L(a),L(c)),max(L(b),L(d)),col)
    (a,b),(c,d)=pts[-2],pts[-1]; dx,dy=(c>a)-(c<a),(d>b)-(d<b); X,Y=L(c),L(d)
    for k in (1,2): g[(X-dx*k-dy*k,Y-dy*k-dx*k)]=col; g[(X-dx*k+dy*k,Y-dy*k+dx*k)]=col
ink,acc=rgb('#34405a'),rgb('#4f72a8'); rot=lambda p:[(4-a,4-b) for a,b in p]
A=[(0,4),(0,1),(2,1)]; B=[(3,4),(1,4),(1,2)]
for p,c in ((A,ink),(rot(A),ink),(B,acc),(rot(B),acc)): arrow(p,c)
icons['arrow-me-out']=place(tile(rgb('#faf7f2'),rgb('#c9c4b8')),g)
out=sys.argv[1]
for k,px in icons.items(): save(px,f'{out}/{k}.png')
# contact sheet for review
sheet={}
if len(sys.argv)>2:
    keys=list(icons); cols=3; bg=rgb('#333333')
    Wd=cols*N*SC; Hd=((len(keys)+cols-1)//cols)*N*SC; rows=[]
    for Y in range(Hd):
        r=bytearray(b'\0')
        for X in range(Wd):
            i=(Y//(N*SC))*cols+X//(N*SC); c=bg
            if i<len(keys):
                p=icons[keys[i]].get(((X%(N*SC))//SC,(Y%(N*SC))//SC))
                if p: c=p
            r+=bytes(c)
        rows.append(bytes(r))
    ch=lambda t,d: struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    open(sys.argv[2],'wb').write(b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',Wd,Hd,8,6,0,0,0))+ch(b'IDAT',zlib.compress(b''.join(rows),9))+ch(b'IEND',b''))
