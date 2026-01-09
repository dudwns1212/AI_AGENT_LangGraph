///
/// 병원 검색 도구
///
import { pool } from "../db.js";

export async function searchHospitalTool({ location, symptoms, constraints }) {
    const { weekend_service, affordable_cost } = constraints ?? {};

    let query = `SELECT name, dept, weekend, price_level AS price, distance_km AS distance FROM hospitals WHERE 1=1`;

    if (weekend_service) {
        query += ` AND weekend = 1`;
    }
    if (affordable_cost) {
        query += ` AND price_level != '비쌈'`;
    }

    query += ` ORDER BY distance_km ASC`;

    const [rows] = await pool.query(query);
    return rows;
}