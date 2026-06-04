// supabase/functions/export-margenes/index.ts
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts"; // si ya usas algo similar

type MargenRequest = {
  fecha_inicio: string; // "2026-05-31"
  fecha_fin: string;    // "2026-05-31"
};

export const handler = async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { fecha_inicio, fecha_fin } = (await req.json()) as MargenRequest;

    if (!fecha_inicio || !fecha_fin) {
      return new Response(
        JSON.stringify({ error: "Faltan fechas fecha_inicio/fecha_fin" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const start = new Date(fecha_inicio);
    start.setHours(0, 0, 0, 0);
    const end = new Date(fecha_fin);
    end.setHours(23, 59, 59, 999);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    // Misma consulta que usas en margenes.html
    const { data, error } = await supabase
      .from("venta_detalles")
      .select(`
        cantidad,
        precio_unitario_snapshot,
        costo_unitario_snapshot,
        subtotal,
        utilidad_subtotal,
        nombre_snapshot,
        pedidos!inner (
          id,
          fecha_pedido,
          tipo_venta,
          cliente_nombre_snapshot,
          cliente_telefono_snapshot,
          deleted_at
        )
      `)
      .gte("pedidos.fecha_pedido", start.toISOString())
      .lte("pedidos.fecha_pedido", end.toISOString())
      .is("pedidos.deleted_at", null)
      .order("fecha_pedido", { ascending: true, foreignTable: "pedidos" });

    if (error) {
      console.error("Error query venta_detalles:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const filas = (data || []).map((d: any) => {
      const pedido = d.pedidos;
      const cantidad = Number(d.cantidad || 0);
      const precio = Number(d.precio_unitario_snapshot || 0);
      const costoUnit = d.costo_unitario_snapshot != null ? Number(d.costo_unitario_snapshot) : 0;
      const subtotal =
        d.subtotal != null && !Number.isNaN(Number(d.subtotal))
          ? Number(d.subtotal)
          : precio * cantidad;
      const margen =
        d.utilidad_subtotal != null && !Number.isNaN(Number(d.utilidad_subtotal))
          ? Number(d.utilidad_subtotal)
          : (precio - costoUnit) * cantidad;

      const costoTotal = costoUnit * cantidad;

      const clienteNombre = pedido.cliente_nombre_snapshot || "Sin cliente";
      const clienteTelefono = pedido.cliente_telefono_snapshot || "";
      const tipoVenta = pedido.tipo_venta === "servicio" ? "Servicio" : "Productos";

      return {
        fecha: new Date(pedido.fecha_pedido),
        cliente: clienteNombre,
        telefono: clienteTelefono,
        tipo: tipoVenta,
        detalle: d.nombre_snapshot || "Producto/Servicio",
        cantidad,
        precio_unit: precio,
        costo_unit: costoUnit,
        subtotal,
        costo_total: costoTotal,
        margen
      };
    });

    // Generar Excel con exceljs
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Márgenes");

    // Encabezados
    const headers = [
      "Fecha / Hora",
      "Cliente",
      "Teléfono",
      "Tipo",
      "Detalle / Producto",
      "Cant.",
      "Precio Unit.",
      "Costo Unit.",
      "Subtotal",
      "Costo total",
      "Margen Net."
    ];

    ws.addRow(headers);
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4A3B32" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.height = 26;

    const moneda = '"S/"#,##0.00';

    // Filas de datos
    filas.forEach((f) => {
      const row = ws.addRow([
        f.fecha,
        `${f.cliente}${f.telefono ? "\n" + f.telefono : ""}`,
        f.telefono,
        f.tipo,
        f.detalle,
        f.cantidad,
        f.precio_unit,
        f.costo_unit,
        f.subtotal,
        f.costo_total,
        f.margen
      ]);
      row.height = 22;
    });

    // Formato columnas
    ws.getColumn(1).width = 18; // Fecha / Hora
    ws.getColumn(2).width = 28; // Cliente
    ws.getColumn(3).width = 14; // Teléfono
    ws.getColumn(4).width = 14; // Tipo
    ws.getColumn(5).width = 30; // Detalle
    ws.getColumn(6).width = 8;  // Cant.
    ws.getColumn(7).width = 14; // Precio
    ws.getColumn(8).width = 14; // Costo
    ws.getColumn(9).width = 14; // Subtotal
    ws.getColumn(10).width = 14; // Costo total
    ws.getColumn(11).width = 14; // Margen

    // Aplicar formato moneda a columnas 7–11
    [7, 8, 9, 10, 11].forEach((colIdx) => {
      ws.getColumn(colIdx).numFmt = moneda;
    });

    // Fila de totales al final
    const lastRowNumber = ws.rowCount + 1;
    ws.getCell(`E${lastRowNumber}`).value = "TOTALES";
    ws.getCell(`E${lastRowNumber}`).font = { bold: true };

    ws.getCell(`F${lastRowNumber}`).value = { formula: `SUM(F2:F${ws.rowCount})` };
    ws.getCell(`I${lastRowNumber}`).value = { formula: `SUM(I2:I${ws.rowCount})` };
    ws.getCell(`J${lastRowNumber}`).value = { formula: `SUM(J2:J${ws.rowCount})` };
    ws.getCell(`K${lastRowNumber}`).value = { formula: `SUM(K2:K${ws.rowCount})` };

    // Generar binario
    const buffer = await workbook.xlsx.writeBuffer();

    const fechaLabelInicio = fecha_inicio || "sin_inicio";
    const fechaLabelFin = fecha_fin || "sin_fin";
    const fileName = `margenes_${fechaLabelInicio}_a_${fechaLabelFin}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`
      }
    });
  } catch (err) {
    console.error("Error export-margenes:", err);
    return new Response(
      JSON.stringify({ error: "Error al generar el Excel" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

Deno.serve(handler);