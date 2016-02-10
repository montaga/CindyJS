var adj = {};


function addEdge(a, b) {
  if (!adj.hasOwnProperty(a)) adj[a] = {};
  if (!adj[a].hasOwnProperty(b)) adj[a][b] = true;
  console.log("added edge " + a + " -> " + b);
}

var precompdone = false;

var vis = {};

// Create a new directed graph 
//var g = new dagre.graphlib.Graph();

var graph = {"id": "root",
      "properties": {
        "direction": "LEFT",
     //   "spacing": 10
      },
      "children": [],
      "edges": []
    }
var layouted;

function drawDiagram(v0) {
  if (!precompdone) {


    function dfs(a) {
      if (vis[a]) return;
      vis[a] = true;
      graph["children"].push(
        {
          "id": a,
          "width": canvaswrappers[a].sizeX,
          "height": canvaswrappers[a].sizeY
        }
        );
         
        
        
      for (let b in adj[a]) {
        dfs(b);
        graph["edges"].push({
          "id": "e" + a + b,
          "source": a,
          "target": b
        });
        console.log("added edge " + a + " -> " + b);
      }
    }

    dfs(v0);


    $klay.layout({
      "graph": graph,
      "options": {  },
      "success": function(l) { layouted = l; console.log(layouted); },
      "error": function(error) { console.log(error); }
    });

    var c = document.createElement("canvas");
    c.id = "diagramcanvas";
   // c.width = g['_label']['width'];
   // c.height = g['_label']['height'];
    c.width = layouted["width"];
    c.height = layouted["height"];
    c.style = "width: " + layouted["width"]/2 + "px; height: " + layouted["height"]/2 + "px";
    document.body.appendChild(c);

    precompdone = true;
  }



  var c = document.getElementById("diagramcanvas");
  var ctx = c.getContext("2d");




  function drawcurve(points) {
    if(points.length<=1) return;
    // move to the first point
    ctx.strokeStyle = "#000000";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    let i = 0;
    for (; i < points.length - 1; i++) {
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[i + 1].x, points[i + 1].y);
    }
    // curve through the last two points
    //ctx.lineTo(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    i = i-1;


    var headlen = 20; // length of head in pixels
    var angle = Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x);
    ctx.moveTo(points[i + 1].x, points[i + 1].y);
    ctx.lineTo(points[i + 1].x - headlen * Math.cos(angle - Math.PI / 6), points[i + 1].y - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(points[i + 1].x, points[i + 1].y);
    ctx.lineTo(points[i + 1].x - headlen * Math.cos(angle + Math.PI / 6), points[i + 1].y - headlen * Math.sin(angle + Math.PI / 6));


    ctx.stroke();
  };
  
  if(layouted) {
  
    for(let idx in layouted["children"]) {
      let v = layouted["children"][idx];
      canvaswrappers[v["id"]].drawTo(ctx, v['x'], v['y']);

      ctx.fillStyle = "#000000";
      
      ctx.font = '15pt Sans Serif';
      ctx.fillText(v["id"], v['x'], v['y']);
    }
    
    
    for(let idx in layouted["edges"]) {
      let e = layouted["edges"][idx];
      //console.log(JSON.stringify(e));
      if(!e.p1){
        let p = [e["sourcePoint"]];
        if(e["bendPoints"])
          p = p.concat(e["bendPoints"]);
        p = p.concat([e["targetPoint"]]);
        //let p = Array.prototype.concat(Array.prototype.concat([e["sourcePoint"]], e["bendPoints"]),[e["targetPoint"]]);
        e.p1 = p.map( function(pt) {return {x : pt["x"], y: pt["y"]}} );
        
      }
      drawcurve(e.p1);
    }
  /*
    g['nodes']().forEach(function(name) {
      var v = g['node'](name);
      canvaswrappers[name].drawTo(ctx, v.x - v.width / 2, v.y - v.height / 2);

      ctx.fillStyle = "#000080";
      ctx.fillText(v.label, v.x, v.y);
    });

    g['edges']().forEach(function(name) {
      var e = g['edge'](name);
      drawcurve(e['points']);
    });
    */
  }
}

