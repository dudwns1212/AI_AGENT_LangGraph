///
/// 약국 검색 도구
///
import { pool } from "../db.js";

export async function searchPharmacyTool({ location, openNow }) {
  let query = `
    SELECT name, address, open_24h, distance_km AS distance
    FROM pharmacies
    WHERE 1=1
  `;

  if (openNow) {
    query += ` AND open_24h = 1`;
  }

  query += ` ORDER BY distance_km ASC`;

  const [rows] = await pool.query(query);
  return rows;
}
