/* returns [0, 1, ..., n-1] */
let range = n => Array.from(Array(n).keys());

/* How should a vecn be composed, e.g. sizes 7 = [3,4] i.e. struct vec7 {vec3 a0, vec4 a1} */
let sizes = n => n <= 4 ? [n] : n == 5 ? [2, 3] : sizes(n - 4).concat([4]);

let computeidx = (k, n) => {
    let s = sizes(n);
    for (let i in s) {
        if (s[i] <= k) k -= s[i];
        else return {
            first: i,
            second: k
        };
    }
    console.error('Accessing index out of range');
};

//get childs of types that are formed from structs
function genchilds(t) {
    let fp = finalparameter(t);
    let d = depth(t);
    if (fp === type.complex) {
        let rt = replaceCbyR(t);
        return (d === 0 ? ["x", "y"] : ["real", "imag"]).map(name => ({
            type: rt,
            name: name
        }));
    } else if (issubtypeof(fp, type.float)) {
        if (d == 1) {
            return sizes(t.length).map((k, i) => ({
                type: type.vec(k),
                name: `a${i}`
            }));
        } else if (d => 2) {
            return range(t.length).map(i => ({
                type: t.parameters,
                name: `a${i}`
            }));
        }
    }
    return [];
}


function createstruct(t, codebuilder) {
    if (isnativeglsl(t)) return;
    let name = webgltype(t);
    codebuilder.add('structs', name, () => `struct ${name} { ${
    genchilds(t).map(ch => createstruct(ch.type, codebuilder) || `${webgltype(ch.type)} ${ch.name};`).join('')
  }};`);
  
}

function generatematmult(t, modifs, codebuilder) {
  if(isnativeglsl(t)) return;
  let n = t.length;
  let m = t.parameters.length;
    let name = `mult${n}_${m}`;
    codebuilder.add('functions', name, () =>  `vec${n} mult${n}_${m}(mat${n}_${m} a, vec${m} b){` +
        'return ' + usevec(n)(range(n).map(k => usedot(m)([`a.a${k}`, 'b'], modifs, codebuilder)), modifs, codebuilder) + ';' +
        '}');
}

function generatesum(t, modifs, codebuilder) {
  if(isnativeglsl(t)) return;
  let n = t.length;
    let name = `sum${webgltype(t)}`;
        
    codebuilder.add('functions', name, () =>  `${webgltype(t.parameters)} ${name}(${webgltype(t)} a){` +
      `${webgltype(t.parameters)} res = ${constantreallist(t.parameters, 0)([],modifs,codebuilder)};
      ${
        range(n).map(k =>
          useadd(t.parameters)(['res',
          accesslist(t, k)(['a',k], modifs, codebuilder)
        ],modifs,codebuilder)
        ).join('\n')
      }
        return res;
    }`);
}

function generatecmatmult(t, modifs, codebuilder) {
  let n = t.length;
  let m = t.parameters.length;
    let rt = replaceCbyR(t);
    let name = `cmult${n}_${m}`;
    //(A.real+i*A.imag)*(b.real+i*b.imag) = (A.real*b.real - A.imag*b.imag) + i *(A.real*b.imag+A.imag*b.real)
    // from measurements it turend that this is the fastest for 2x2 matrices (better than component wise complex multiplication or using [[a, -b], [b, a]] submatrices)
    codebuilder.add('functions', name, () =>  `cvec${n} cmult${n}_${m}(cmat${n}_${m} a, cvec${m} b){
      return cvec${n}(${
        usesub(rt.parameters)([
          usemult(rt)(['a.real','b.real'], modifs, codebuilder),
          usemult(rt)(['a.imag','b.imag'], modifs, codebuilder)
        ], modifs, codebuilder)
      },${
        useadd(rt.parameters)([
          usemult(rt)(['a.real','b.imag'], modifs, codebuilder),
          usemult(rt)(['a.imag','b.real'], modifs, codebuilder)
        ], modifs, codebuilder)
      });
    }`);
}

function generatedot(n, codebuilder) {
    if((2 <= n && n<=4)) return;
    let name = `dot${n}`;
    codebuilder.add('functions', name, () =>  `float dot${n}(vec${n} a, vec${n} b) {
    return ${ sizes(n).map((size, k) => `dot(a.a${k},b.a${k})`).join('+')}; }`);
}

function generatecdot(n, modifs, codebuilder) {
    let name = `cdot${n}`;
    codebuilder.add('functions', name, () =>  `vec2 cdot${n}(cvec${n} a, cvec${n} b) {
  return vec2(${
      usedot(n)(['a.real','b.real'], modifs, codebuilder)
    } + ${
      usedot(n)(['a.imag','b.imag'], modifs, codebuilder)
    }, ${
      usedot(n)(['a.real','b.imag'], modifs, codebuilder)
    } + ${
      usedot(n)(['a.imag','b.real'], modifs, codebuilder)
    }
  ); }`);
}

function generateadd(t, modifs, codebuilder) {
    let name = `add${webgltype(t)}`;
    codebuilder.add('functions', name, () =>  `${webgltype(t)} ${name}(${webgltype(t)} a, ${webgltype(t)} b) {
    return ${webgltype(t)}(${
        genchilds(t).map(ch => `${webgltype(ch.type)}(${
          useadd(ch.type)([`a.${ch.name}`,`b.${ch.name}`], modifs, codebuilder)
        })`).join(',')
      });
    }`);
}

function generatesub(t, modifs, codebuilder) {
    let name = `sub${webgltype(t)}`;
    codebuilder.add('functions', name, () =>  `${webgltype(t)} ${name}(${webgltype(t)} a, ${webgltype(t)} b) {
    return ${webgltype(t)}(${
        genchilds(t).map(ch => `${webgltype(ch.type)}(${
          usesub(ch.type)([`a.${ch.name}`,`b.${ch.name}`], modifs, codebuilder)
        })`).join(',')
      });
    }`);
}

function generatescalarmult(t, modifs, codebuilder) {
    let name = `scalarmult${webgltype(t)}`;
    codebuilder.add('functions', name, () =>  `${webgltype(t)} ${name}(float a, ${webgltype(t)} b) {
    return ${webgltype(t)}(${
          genchilds(t).map(ch => `${webgltype(ch.type)}(${
            usescalarmult(ch.type)([`a`,`b.${ch.name}`], modifs, codebuilder)
          })`).join(',')
        });
    }`);
}

function generatecscalarmult(t, modifs, codebuilder) {
    let name = `cscalarmult${webgltype(t)}`;
    let rt = replaceCbyR(t);

    codebuilder.add('functions', name, () =>  `${webgltype(t)} ${name}(vec2 a, ${webgltype(t)} b) {
    return ${webgltype(t)}(${
      usesub(rt)([
        usescalarmult(rt)(['a.x','b.real'], modifs, codebuilder),
        usescalarmult(rt)(['a.y','b.imag'], modifs, codebuilder)
      ], modifs, codebuilder)
    },${
      useadd(rt)([
        usescalarmult(rt)(['a.x','b.imag'], modifs, codebuilder),
        usescalarmult(rt)(['a.y','b.real'], modifs, codebuilder)
      ], modifs, codebuilder)
    });}`);
}

function usemult(t) {
  if (isnativeglsl(t)) return useinfix('*');
  let fp = finalparameter(t);
  if(issubtypeof(fp, type.float))
    return (args, modifs, codebuilder) => generatematmult(t, modifs, codebuilder) || `mult${t.length}_${t.parameters.length}(${args.join(',')})`;
  else if(fp === type.complex)
    return (args, modifs, codebuilder) => generatecmatmult(t, modifs, codebuilder) || `cmult${t.length}_${t.parameters.length}(${args.join(',')})`;
  
}

function usedot(n) {
  return (args, modifs, codebuilder) => generatedot(n, codebuilder) || `dot${(2 <= n && n<=4) ? '' : n}(${args.join(',')})`;
}

function usecdot(n) {
  return (args, modifs, codebuilder) => generatecdot(n, modifs, codebuilder) || `cdot${n}(${args.join(',')})`;
}

function useadd(t) {
  if(isnativeglsl(t)) return useinfix('+');
  else return (args, modifs, codebuilder) => generateadd(t, modifs, codebuilder) || `add${webgltype(t)}(${args.join(',')})`;
}

function usesub(t) {
  if(isnativeglsl(t)) return useinfix('-');
  else return (args, modifs, codebuilder) => generatesub(t, modifs, codebuilder) || `sub${webgltype(t)}(${args.join(',')})`;
}

function usesum(t) {
  if(isrvectorspace(t) && depth(t)==1) return (args, modifs, codebuilder) => usedot(t.length)(
    [args[0], usevec(t.length)(Array(t.length).fill('1.'), modifs, codebuilder)], modifs, codebuilder);
  else return (args, modifs, codebuilder) => generatesum(t, modifs, codebuilder) || `sum${webgltype(t)}(${args.join(',')})`;
}
  
function usevec(n) {
    if(2 <= n && n <= 4) return args => `vec${n}(${args.join(',')})`;
    if(n == 1) return args => `float(${args.join(',')})`;
    let cum = 0;
    return (args, modifs, codebuilder) => createstruct(type.vec(n), codebuilder) || `vec${n}(${
        sizes(n).map( s =>
          `vec${s}(${range(s).map(l => ++cum && args[cum-1]).join(',')})`
        ).join(',')
      })`;
}

function usecvec(n) {
    return (args, modifs, codebuilder) => createstruct(type.cvec(n), codebuilder) || `cvec${n}(${
          usevec(n)(args.map(a => `(${a}).x`), modifs, codebuilder)
        },${
          usevec(n)(args.map(a => `(${a}).y`), modifs, codebuilder)
        })`;
}

function uselist(t) {
  let d = depth(t);
  if(isnativeglsl(t)) {
    if(d==2) {
       let n = t.length, m = t.parameters.length;
      if(n == m && 2 <= n && n <= 4) //transpose by hand as it is not supported in WebGL
        return args => `mat${n}(${range(n).map(k => `vec${n}(${ //col k
          range(n).map(i => `${args[i]}[${k}]`).join(',') 
        })`).join(',')}`;
      }
    return (args, modifs, codebuilder) => `${webgltype(t)}(${args.join(',')})`;
  }
  if(d == 1) {
    if(isrvectorspace(t)) return usevec(t.length);
    if(iscvectorspace(t)) return usecvec(t.length);
  }
  let fp = finalparameter(t);
  if (fp === type.complex) {
    let rt = replaceCbyR(t);
    return (args, modifs, codebuilder) => createstruct(t, codebuilder) || `${webgltype(t)}(${
            uselist(rt)(args.map(a => `(${a}).real`), modifs, codebuilder)
          },${
            uselist(rt)(args.map(a => `(${a}).imag`), modifs, codebuilder)
          })`;
    }
  
  return (args, modifs, codebuilder) => createstruct(t, codebuilder) ||  `${webgltype(t)}(${args.join(',')})`;
}

function accesslist(t, k) {
  let fp = finalparameter(t);
  if (fp === type.complex) {
      let rt = replaceCbyR(t);
      return (args, modifs, codebuilder) => `${webgltype(t.parameters)}(${
            accesslist(rt, k)([args[0]+'.real'], modifs, codebuilder)
          },${
            accesslist(rt, k)([args[0]+'.imag'], modifs, codebuilder)
          })`;
  }
  let d = depth(t);
  if(d==1 && isrvectorspace(t)) {
    return accessvecbyshifted(t.length, k);
  }
  return (args, modifs, codebuilder) => `(${args[0]}).a${k}`;
}

/** creates a reallist of type t that has everywhere value val */
function constantreallist(t, val) {
  if(isnativeglsl(t))
    return (args, modifs, codebuilder) => `${webgltype(t)}(float(${val}))`;
  else
    return (args, modifs, codebuilder) => `${uselist(t)}(dadadadada${
      genchilds(t).map(ch => constantreallist(ch.type, val)(args, modifs, codebuilder)).join(',')
    })`;
}

function accessvecbyshifted(n, k) {
  return (args, modifs, codebuilder) => { //works only for hardcoded glsl
      if(n == 1)
          return `(${args[0]})`;
      if(2 <= n && n <= 4)
          return `(${args[0]})[${k}]`;
      let idx = computeidx(k, n);
      return `(${args[0]}).a${idx.first}[${idx.second}]`;
  };
}


function usescalarmult(t) { //assume t is a R or C-vectorspace
  if(isnativeglsl(t)) return useinfix('*');
  return (args, modifs, codebuilder) => generatescalarmult(t,modifs, codebuilder) || `scalarmult${webgltype(t)}(${args.join(',')})`;
}

function usecscalarmult(t) { //assume t is a C-vectorspace
  return (args, modifs, codebuilder) => generatecscalarmult(t,modifs, codebuilder) || `cscalarmult${webgltype(t)}(${args.join(',')})`;
}
