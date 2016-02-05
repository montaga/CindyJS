var adj = {};


function addEdge(a, b) {
  if (!adj.hasOwnProperty(a)) adj[a] = {};
  if (!adj[a].hasOwnProperty(b)) adj[a][b] = true;
  console.log("added edge " + a + " -> " + b);
}

var precompdone = false;

var vis = {};

// Create a new directed graph 
var g = new dagre.graphlib.Graph();


function drawDiagram(v0) {
  if (!precompdone) {


    // Set an object for the graph label
    g['setGraph']({'rankdir': 'RL'});

    // Default to assigning a new object as a label for each new edge.
    g['setDefaultEdgeLabel'](function() {
      return {};
    });



    function dfs(a) {
      if (vis[a]) return;
      vis[a] = true;
      for (let b in adj[a]) {
        dfs(b);
        g['setNode'](a, {
          label: a,
          width: canvaswrappers[a].sizeX,
          height: canvaswrappers[a].sizeY
        });
        g['setEdge'](a, b);
        console.log("added edge " + a + " -> " + b);
      }
    }

    dfs(v0);


    dagre.layout(g);


    var c = document.createElement("canvas");
    c.id = "diagramcanvas";
    c.width = g['_label']['width'];
    c.height = g['_label']['height'];

    document.body.appendChild(c);

    precompdone = true;
  }



  var c = document.getElementById("diagramcanvas");
  var ctx = c.getContext("2d");




  function drawcurve(points) {
    // move to the first point
    ctx.strokeStyle = "#000000";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    let i = 1;
    for (; i < points.length - 2; i++) {
      var xc = (points[i].x + points[i + 1].x) / 2;
      var yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    // curve through the last two points
    ctx.quadraticCurveTo(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);


    var headlen = 10; // length of head in pixels
    var angle = Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x);
    ctx.moveTo(points[i + 1].x, points[i + 1].y);
    ctx.lineTo(points[i + 1].x - headlen * Math.cos(angle - Math.PI / 6), points[i + 1].y - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(points[i + 1].x, points[i + 1].y);
    ctx.lineTo(points[i + 1].x - headlen * Math.cos(angle + Math.PI / 6), points[i + 1].y - headlen * Math.sin(angle + Math.PI / 6));


    ctx.stroke();
  };

  g['nodes']().forEach(function(name) {
    var v = g['node'](name);
    /* ctx.fillStyle = "#AAAAAA";
     ctx.fillRect(v.x-v.width/2,v.y-v.height/2,v.width,v.height);
     */
    canvaswrappers[name].drawTo(ctx, v.x - v.width / 2, v.y - v.height / 2);

    ctx.fillStyle = "#000080";
    ctx.fillText(v.label, v.x, v.y);
  });

  g['edges']().forEach(function(name) {
    var e = g['edge'](name);
    drawcurve(e['points']);
  });
}

