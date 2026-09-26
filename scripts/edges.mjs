// Canny + Zhang-Suen algorithms from the original MIT-licensed Line-Art Converter.
// Extracted for use by both the browser converter and Node tests.
function gaussianBlur(gray, W, H, sigma){
    if(sigma<=0.01) return gray;
    const r=Math.max(1, Math.ceil(sigma*2));
    const size=r*2+1;
    const k=new Float32Array(size);
    let sum=0;
    for(let i=0;i<size;i++){ const x=i-r; const v=Math.exp(-(x*x)/(2*sigma*sigma)); k[i]=v; sum+=v; }
    for(let i=0;i<size;i++) k[i]/=sum;
    const tmp=new Float32Array(W*H);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        let acc=0;
        for(let i=-r;i<=r;i++){ const xx=Math.min(W-1, Math.max(0, x+i)); acc += gray[y*W+xx] * k[i+r]; }
        tmp[y*W+x]=acc;
    }
    const out=new Float32Array(W*H);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        let acc=0;
        for(let i=-r;i<=r;i++){ const yy=Math.min(H-1, Math.max(0, y+i)); acc += tmp[yy*W+x] * k[i+r]; }
        out[y*W+x]=acc;
    }
    return out;
}
function sobel(gray, W, H){
    const mag=new Float32Array(W*H);
    const ang=new Float32Array(W*H);
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
        const i=y*W+x;
        const a=gray[(y-1)*W+(x-1)], b=gray[(y-1)*W+x], c=gray[(y-1)*W+(x+1)];
        const d=gray[y*W+(x-1)],                         f=gray[y*W+(x+1)];
        const g=gray[(y+1)*W+(x-1)], h=gray[(y+1)*W+x], k=gray[(y+1)*W+(x+1)];
        const Gx = -a -2*d -g + c +2*f + k;
        const Gy = -a -2*b -c + g +2*h + k;
        mag[i]=Math.sqrt(Gx*Gx+Gy*Gy);
        ang[i]=Math.atan2(Gy, Gx);
    }
    return {mag, ang};
}
function nonMaxSuppression(mag, ang, W, H){
    const out=new Float32Array(W*H);
    const PI=Math.PI;
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
        const i=y*W+x;
        let a=ang[i]*180/PI; if(a<0) a+=180;
        let n1=0,n2=0;
        if((a>=0 && a<22.5) || (a>=157.5 && a<180)){ n1=mag[i-1]; n2=mag[i+1]; }
        else if(a>=22.5 && a<67.5){ n1=mag[i-W-1]; n2=mag[i+W+1]; }
        else if(a>=67.5 && a<112.5){ n1=mag[i-W]; n2=mag[i+W]; }
        else { n1=mag[i-W+1]; n2=mag[i+W-1]; }
        out[i] = (mag[i]>=n1 && mag[i]>=n2) ? mag[i] : 0;
    }
    return out;
}
function hysteresis(nms, W, H, high, low){
    let max=0;
    for(let i=0;i<nms.length;i++) if(nms[i]>max) max=nms[i];
    if (max <= 1e-8) return new Uint8Array(W*H);
    const hi=max*high, lo=max*low;
    const out=new Uint8Array(W*H);
    const stack=[];
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
        const i=y*W+x;
        if(nms[i]>=hi){ out[i]=2; stack.push(i); }
        else if(nms[i]>=lo){ out[i]=1; }
    }
    while(stack.length){
        const i=stack.pop();
        const x=i%W, y=(i/W)|0;
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
            if(!dx && !dy) continue;
            const xx=x+dx, yy=y+dy;
            if(xx<0||yy<0||xx>=W||yy>=H) continue;
            const j=yy*W+xx;
            if(out[j]===1){ out[j]=2; stack.push(j); }
        }
    }
    const res=new Uint8Array(W*H);
    for(let i=0;i<res.length;i++) res[i]=(out[i]===2)?1:0;
    return res;
}

function thinning(binary, W, H){
    const img = new Uint8Array(binary);
    const get = (x,y) => (x<0||y<0||x>=W||y>=H) ? 0 : img[y*W+x];
    let changed = true;
    let safety = 30;
    while(changed && safety-- > 0){
        changed = false;
        const rm1 = [];
        for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
            if(!img[y*W+x]) continue;
            const P2=get(x,y-1),P3=get(x+1,y-1),P4=get(x+1,y),P5=get(x+1,y+1),
                  P6=get(x,y+1),P7=get(x-1,y+1),P8=get(x-1,y),P9=get(x-1,y-1);
            const B = P2+P3+P4+P5+P6+P7+P8+P9;
            if(B<2 || B>6) continue;
            let A = 0;
            const arr = [P2,P3,P4,P5,P6,P7,P8,P9,P2];
            for(let i=0;i<8;i++) if(arr[i]===0 && arr[i+1]===1) A++;
            if(A!==1) continue;
            if(P2*P4*P6!==0) continue;
            if(P4*P6*P8!==0) continue;
            rm1.push(y*W+x);
        }
        if(rm1.length){ changed=true; rm1.forEach(i=>img[i]=0); }
        const rm2 = [];
        for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
            if(!img[y*W+x]) continue;
            const P2=get(x,y-1),P3=get(x+1,y-1),P4=get(x+1,y),P5=get(x+1,y+1),
                  P6=get(x,y+1),P7=get(x-1,y+1),P8=get(x-1,y),P9=get(x-1,y-1);
            const B = P2+P3+P4+P5+P6+P7+P8+P9;
            if(B<2 || B>6) continue;
            let A = 0;
            const arr = [P2,P3,P4,P5,P6,P7,P8,P9,P2];
            for(let i=0;i<8;i++) if(arr[i]===0 && arr[i+1]===1) A++;
            if(A!==1) continue;
            if(P2*P4*P8!==0) continue;
            if(P2*P6*P8!==0) continue;
            rm2.push(y*W+x);
        }
        if(rm2.length){ changed=true; rm2.forEach(i=>img[i]=0); }
    }
    return img;
}

function angleToChar(angRad, charset, autoOrient, onlyDots){
    const chars = Array.from(charset || '.·:+');
    if(!chars.length) return '.';
    if(onlyDots || !autoOrient || chars.length === 1) return chars[0];

    let gradDeg = angRad * 180 / Math.PI;
    if(gradDeg < 0) gradDeg += 180;
    let lineDeg = (gradDeg + 90) % 180;

    if(chars.length >= 8){
        let zone8;
        if(lineDeg < 22.5 || lineDeg >= 157.5) zone8 = 0;
        else if(lineDeg < 45) zone8 = 1;
        else if(lineDeg < 67.5) zone8 = 2;
        else if(lineDeg < 90) zone8 = 3;
        else if(lineDeg < 112.5) zone8 = 4;
        else if(lineDeg < 135) zone8 = 5;
        else if(lineDeg < 157.5) zone8 = 6;
        else zone8 = 7;
        const t = zone8 / 7;
        return chars[Math.min(chars.length-1, Math.round(t*(chars.length-1)))] || chars[0];
    } else {
        let idx;
        if(lineDeg < 22.5 || lineDeg >= 157.5) idx = 0;
        else if(lineDeg < 67.5) idx = 1;
        else if(lineDeg < 112.5) idx = 2;
        else idx = 3;
        const t = idx / 3;
        return chars[Math.min(chars.length-1, Math.round(t*(chars.length-1)))] || chars[0];
    }
}

function spatialSample(allPoints, gridStep, maxCats){
    const cells = new Map();
    for(const p of allPoints){
        const kx = Math.floor(p.x / gridStep);
        const ky = Math.floor(p.y / gridStep);
        const key = kx + '_' + ky;
        if(!cells.has(key)) cells.set(key, p);
    }
    let sampled = [...cells.values()];
    if(sampled.length > maxCats){
        const step2 = sampled.length / maxCats;
        const trimmed = [];
        for(let i = 0; i < maxCats; i++){
            trimmed.push(sampled[Math.floor(i*step2)]);
        }
        sampled = trimmed;
    }
    return sampled;
}


export { gaussianBlur, sobel, nonMaxSuppression, hysteresis, thinning, angleToChar, spatialSample };
