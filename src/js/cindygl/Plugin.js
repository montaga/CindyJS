var nada;
var myfunctions;

createCindy.registerPlugin(1, "CindyGL", function(capi) {

  //////////////////////////////////////////////////////////////////////
  // API bindings

  api = capi;
  nada = api.nada;
  myfunctions = api.getMyfunctions();
  
  api.defineFunction("compile",1,function(args, modifs) {
    let expr = args[0];
    let code = generateColorPlotProgram(expr);
    console.log(code);
    return {
      ctype: 'string',
      value: code
    };
    //console.log(myfunctions);
  });
  
  api.defineFunction("colorplot", 4, function(args, modifs) {
    initGLIfRequired();
    
    var a = api.eval_helper.extractPoint(api.evaluateAndVal(args[0]));
    var b = api.eval_helper.extractPoint(api.evaluateAndVal(args[1]));
    var name = api.evaluate(args[2]);
    var prog = args[3];
    
    if (!a.ok || !b.ok || name.ctype !== 'string') {
        return nada;
    }
    
    var localcanvas = document.getElementById(name.value);
    if (typeof(localcanvas) === "undefined" || localcanvas === null) {
        return nada;
    }
    
    var cw = localcanvas.width;
    var ch = localcanvas.height;
    
    if(!prog.iscompiled) {
      //console.log("Program is not compiled. So we will do that");
      prog.iscompiled = true;
      prog.renderer = new Renderer(api, prog, cw, ch);
    } /*else {
      console.log("Program has been compiled; we will use that compiled code.");
    }*/

    let alpha = ch/cw;
    let n = {x: -(b.y-a.y)*alpha, y: (b.x-a.x)*alpha};
    let c = {x: a.x + n.x, y: a.y + n.y};
    //let d = {x: b.x + n.x, y: b.y + n.y};
    
    prog.renderer.render(a, b, c);
    
    
    var localcontext = localcanvas.getContext('2d');
    //TODO: clear canvas first... usefull if rendered with alpha...
    localcontext.drawImage(glcanvas, 0, 0);
    

    return nada;
  });
  
});


