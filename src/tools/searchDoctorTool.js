///
/// 의사 검색 도구
///
import { pool } from "../db.js";

export async function searchDoctorTool({ specialty, location }) {
  const query = `
    SELECT name, specialty, hospital, experience_years
    FROM doctors
    WHERE specialty = ?
    ORDER BY experience_years DESC
  `;

  const [rows] = await pool.query(query, [specialty]);
  return rows;
}
