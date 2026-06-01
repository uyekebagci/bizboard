package com.bizboard.common.enums;

/**
 * WP Sub-Cash Retroactive Inclusion: bir tx'in sub-cash'e dahil edilme sebebi.
 *
 * <ul>
 *   <li>{@link #AUTOMATIC}: tx oluşturulurken (veya güncellenirken) entity
 *       assignment match'i olduğu için sistem tarafından eklendi.</li>
 *   <li>{@link #MANUAL}: kullanıcı manuel olarak ekledi — ya tx-time'da
 *       form toggle'ı ile ya da sub-cash detail UI'sından geri dönük.
 *       Beta v1.1 öncesi adı RETROACTIVE idi; basitleştirildi.</li>
 * </ul>
 */
public enum InclusionScope {
    AUTOMATIC,
    MANUAL
}
