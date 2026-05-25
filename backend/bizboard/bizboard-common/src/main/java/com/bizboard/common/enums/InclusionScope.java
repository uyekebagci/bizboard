package com.bizboard.common.enums;

/**
 * WP Sub-Cash Retroactive Inclusion: bir tx'in sub-cash'e dahil edilme sebebi.
 *
 * <ul>
 *   <li>{@link #AUTOMATIC}: tx oluşturulurken (veya güncellenirken) entity
 *       assignment match'i olduğu için sistem tarafından eklendi.</li>
 *   <li>{@link #RETROACTIVE}: kullanıcı sub-cash detail UI'sından manuel olarak
 *       geri dönük ekledi.</li>
 * </ul>
 */
public enum InclusionScope {
    AUTOMATIC,
    RETROACTIVE
}
